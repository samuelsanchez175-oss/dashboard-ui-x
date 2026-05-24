"""Celery task that runs the whole audio → MIDI pipeline.

Stages
------
A. Demucs separates the input audio into {vocals, drums, bass, other}.
B. Each MELODIC stem (vocals, bass, other) is transcribed by Spotify's
   basic-pitch (the ICASSP-2022 SavedModel) into per-stem MIDI.
C. The per-stem MIDI files are merged into one multi-track .mid.

Drums are not transcribed: basic-pitch is a pitched-note model and would just
hallucinate notes from drum hits. The Demucs drums stem is still produced —
it's available on disk during the job — but it's intentionally absent from
the merged MIDI output.

The task updates its own state at each stage so `/status` can show progress
(`stage: "separating_stems"`, etc.).
"""
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

import pretty_midi
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.config import settings


# --------------------------------------------------------------------------- #
# Routing tables                                                              #
# --------------------------------------------------------------------------- #

# Stems we run basic-pitch on. Drums are deliberately excluded — see module docstring.
STEMS_TO_TRANSCRIBE: List[str] = ["vocals", "bass", "other"]

# General-MIDI program numbers used when we re-pack each stem into the merged
# .mid so the file plays back sensibly in a DAW out of the box.
STEM_TO_GM_PROGRAM: Dict[str, int] = {
    "vocals": 53,  # Voice Oohs
    "bass":   33,  # Electric Bass (finger)
    "other":  0,   # Acoustic Grand Piano (catch-all melodic instrument)
}


# --------------------------------------------------------------------------- #
# Stage A — stem separation                                                    #
# --------------------------------------------------------------------------- #

def _run_demucs(input_audio: Path, out_dir: Path) -> Dict[str, Path]:
    """Invoke the Demucs CLI and collect the resulting stem files.

    We shell out instead of using the Python API because Demucs' CLI handles
    model downloads, device selection, and chunking on its own, which keeps the
    worker code small and decoupled from Demucs internals.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "python", "-m", "demucs.separate",
        "-n", settings.demucs_model,
        "-d", settings.demucs_device,
        "-o", str(out_dir),
        str(input_audio),
    ]
    # `check=True` turns a non-zero exit into CalledProcessError, which the task
    # wrapper will surface as a Celery FAILURE.
    subprocess.run(cmd, check=True)

    # Demucs lays files out as: <out_dir>/<model_name>/<track_basename>/<stem>.wav
    track_dir = out_dir / settings.demucs_model / input_audio.stem
    stems: Dict[str, Path] = {}
    for name in ("vocals", "drums", "bass", "other"):
        p = track_dir / f"{name}.wav"
        if p.exists():
            stems[name] = p
    if not stems:
        raise RuntimeError(f"Demucs produced no stems in {track_dir}")
    return stems


# --------------------------------------------------------------------------- #
# Stage B — per-stem transcription (basic-pitch)                               #
# --------------------------------------------------------------------------- #

def _run_basic_pitch(stem_name: str, stem_wav: Path, out_dir: Path) -> Optional[Path]:
    """Transcribe a single stem to MIDI with Spotify's basic-pitch.

    Returns the MIDI path, or None if basic-pitch raised — a single bad stem
    must not take the whole job down with it.
    """
    midi_path = out_dir / f"{stem_name}.mid"

    # Import lazily so worker boot stays fast and TensorFlow only initialises
    # on demand (it's slow and memory-hungry).
    from basic_pitch.inference import predict  # type: ignore

    try:
        # `predict` returns (raw model outputs, PrettyMIDI object, note events).
        # We only need the PrettyMIDI — write it straight to disk.
        _, midi_data, _ = predict(str(stem_wav))
        midi_data.write(str(midi_path))
    except Exception as exc:
        print(f"[basic-pitch] {stem_name} transcription failed: {exc}")
        return None

    return midi_path if midi_path.exists() else None


# --------------------------------------------------------------------------- #
# Stage C — merge into one multi-track MIDI                                    #
# --------------------------------------------------------------------------- #

def _merge_midi(stem_midis: Dict[str, Path], output_path: Path) -> Path:
    """Combine per-stem MIDI files into one multi-instrument PrettyMIDI file.

    pretty_midi stores notes in absolute seconds, so we can pull `Instrument`
    objects from each per-stem file and concatenate them without manually
    re-aligning timing.
    """
    merged = pretty_midi.PrettyMIDI()

    for stem_name, midi_path in stem_midis.items():
        try:
            pm = pretty_midi.PrettyMIDI(str(midi_path))
        except Exception as exc:
            print(f"[merge] skipping {stem_name} ({midi_path}): {exc}")
            continue

        for inst in pm.instruments:
            new_inst = pretty_midi.Instrument(
                program=STEM_TO_GM_PROGRAM.get(stem_name, inst.program),
                is_drum=False,  # we never transcribe drums; everything here is pitched
                name=stem_name,
            )
            # Shallow-copy the timing data — we don't mutate it, so refs are safe.
            new_inst.notes = list(inst.notes)
            new_inst.control_changes = list(inst.control_changes)
            new_inst.pitch_bends = list(inst.pitch_bends)
            merged.instruments.append(new_inst)

    merged.write(str(output_path))
    return output_path


# --------------------------------------------------------------------------- #
# Celery entry point                                                           #
# --------------------------------------------------------------------------- #

@celery_app.task(bind=True, name="transcribe_pipeline")
def run_transcription_pipeline(self, audio_path: str, job_id: str) -> dict:
    """End-to-end pipeline.

    Parameters
    ----------
    audio_path : str
        Absolute path to the uploaded audio file (saved by the API).
    job_id : str
        Stable identifier we use when naming the output MIDI on disk.

    Returns
    -------
    dict
        Result payload stored in the Celery result backend. The API reads this
        from `/status` and `/download`.
    """
    audio = Path(audio_path)

    # Each job gets its own scratch dir under storage_root so concurrent jobs
    # cannot stomp on each other's intermediate stem files.
    work_root = Path(
        tempfile.mkdtemp(prefix=f"nd2_{job_id}_", dir=str(settings.storage_root))
    )
    final_midi = settings.output_dir / f"{job_id}.mid"

    try:
        # --- A. Stem separation -------------------------------------------------
        self.update_state(state="STARTED", meta={"stage": "separating_stems"})
        stems = _run_demucs(audio, work_root / "demucs")

        # --- B. Per-stem transcription -----------------------------------------
        self.update_state(state="STARTED", meta={"stage": "transcribing_stems"})
        midi_dir = work_root / "midi"
        midi_dir.mkdir(parents=True, exist_ok=True)

        stem_midis: Dict[str, Path] = {}
        for stem_name in STEMS_TO_TRANSCRIBE:
            wav_path = stems.get(stem_name)
            if wav_path is None:
                # Demucs didn't produce this stem for some reason — skip it.
                continue
            self.update_state(
                state="STARTED",
                meta={"stage": f"transcribing_{stem_name}"},
            )
            mp = _run_basic_pitch(stem_name, wav_path, midi_dir)
            if mp is not None:
                stem_midis[stem_name] = mp

        if not stem_midis:
            raise RuntimeError("All stems failed to transcribe")

        # --- C. Merge ----------------------------------------------------------
        self.update_state(state="STARTED", meta={"stage": "merging_midi"})
        _merge_midi(stem_midis, final_midi)

        return {
            "stage": "done",
            "midi_path": str(final_midi),
            "stems": sorted(stem_midis.keys()),
        }

    except SoftTimeLimitExceeded:
        # Re-raise so Celery records the timeout cleanly; cleanup happens in `finally`.
        raise

    finally:
        # Always tidy up. The uploaded audio is not useful once the pipeline has
        # produced a MIDI; the scratch dir is even less so. The final MIDI lives
        # in settings.output_dir and is kept until the operator deletes it.
        try:
            audio.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            shutil.rmtree(work_root, ignore_errors=True)
        except Exception:
            pass
