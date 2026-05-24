# Note Detector 2

Cloud-friendly **audio → MIDI** backend, deliberately kept separate from the existing
`chord-detector` UI tool so it can be developed and tested in isolation.

**Pipeline:** upload audio → Demucs (4-stem split) → Omnizart (per-stem transcription)
→ merged multi-track `.mid`.

Stack: **FastAPI + Celery + Redis + PyTorch (Demucs) + TensorFlow (Omnizart)**.

## Endpoints

| Method | Path                  | Description                                                   |
| ------ | --------------------- | ------------------------------------------------------------- |
| `POST` | `/transcribe`         | Upload audio (multipart field `file`). Returns `task_id`.     |
| `GET`  | `/status/{task_id}`   | `Queued` / `Processing` / `Completed` / `Failed` + URL.       |
| `GET`  | `/download/{task_id}` | Streams the merged `.mid`.                                    |
| `GET`  | `/`                   | Liveness check.                                               |

## Run locally

```bash
cd note-detector-2
cp .env.example .env
docker compose up --build
```

API at `http://localhost:8000`.

The first worker startup downloads ~2 GB of Demucs + Omnizart checkpoints into the
`models/` volume — subsequent restarts are fast.

### Quick smoke test

```bash
# 1. submit an audio file
curl -F "file=@/path/to/track.wav" http://localhost:8000/transcribe
# -> {"task_id":"abc...", "job_id":"...", "status":"Queued"}

# 2. poll
curl http://localhost:8000/status/abc...
# -> {"task_id":"abc...","status":"Processing","stage":"separating_stems"}
# eventually:
# -> {"task_id":"abc...","status":"Completed","download_url":"http://localhost:8000/download/abc...","stems":["bass","drums","other","vocals"]}

# 3. fetch the merged MIDI
curl -OJ http://localhost:8000/download/abc...
```

## Architecture notes

### Why two ML stacks in one image

- **Demucs** ships with **PyTorch**.
- **Omnizart** ships with **TensorFlow**.

They coexist, but the image weighs ~6 GB and the first `pip install` is slow.
**Python is pinned to 3.9** because `omnizart` 0.5.x does not support 3.10+.

If you scale this later, the clean split is two Celery workers on dedicated queues —
route `drums` to the TF worker and the melodic stems to the Torch worker (or vice
versa) so neither runtime has to share memory pressure with the other.

### Omnizart sub-module routing

The brief said "drum model for drums, chord model for the rest". The chord model in
Omnizart emits **chord-label CSV**, not note-level MIDI, so for an actual multi-track
MIDI output we route melodic stems through the **music** model (note-level
transcription). Routing is one dict in `app/worker.py:STEM_TO_OMNIZART` — flip it back
to `chord` if you'd rather get chord blocks.

```python
STEM_TO_OMNIZART = {
    "drums":  "drum",
    "vocals": "vocal-contour",
    "bass":   "music",
    "other":  "music",
}
```

### GPU

CPU is the default and is fine for testing. To enable GPU:

1. Set `DEMUCS_DEVICE=cuda` in `.env`.
2. Replace the CPU PyTorch wheel in `Dockerfile` with the matching CUDA wheel.
3. Add `runtime: nvidia` (or a `deploy.resources.reservations.devices` block) to the
   `worker` service in `docker-compose.yml`.

## Benchmark — accuracy vs the chord detector

Two Node scripts measure note-detector-2 against the **same** ground truth and
**same** scorer the existing chord-detector bench uses, so the two tools compare
apples-to-apples. The scorer (±50 ms onset / pitch-match F1, window-filtered,
greedy per-pitch) is copied verbatim from `scripts/chord-detector-phase-score.mjs`.

```bash
# 1. service must be running (separate terminal)
cd note-detector-2 && docker compose up --build

# 2. run the bench + score FROM THE REPO ROOT (needs the repo's @tonejs/midi)
node note-detector-2/scripts/bench.mjs    # POST /transcribe -> poll -> download .mid
node note-detector-2/scripts/score.mjs    # score + emit the comparison doc
```

- `bench.mjs` — submits the same audio test files (`Notes 2.wav`,
  `Frank Ocean Acura ... .mp3`) to the API, saves merged MIDIs to
  `tmp/note-detector-2-bench/`. Pure Node, no deps. Env: `ND2_API`.
- `score.mjs` — scores those MIDIs against `frank  Perfect acura girll .mid`,
  re-scores the chord-detector dumps in `tmp/chord-detector-bench/` with the
  identical scorer, writes **`docs/accuracy-vs-chord-detector.md`**.

Notes on fairness: the drums track is excluded from scoring (GT is pitched
melodic content); the `frank-mid` MIDI-passthrough row is omitted (note-detector-2
takes audio only); `notes2-wav` is time-shifted to share the GT's origin — all
matching the chord-detector bench conventions.

## Folder structure

```
note-detector-2/
├── app/
│   ├── __init__.py
│   ├── celery_app.py       # Celery factory shared by API + worker
│   ├── config.py           # env-driven settings (pydantic-settings)
│   ├── main.py             # FastAPI endpoints
│   └── worker.py           # demucs + omnizart + merge task
├── scripts/
│   ├── bench.mjs           # submit test audio -> save merged MIDI
│   └── score.mjs           # score vs GT + compare to chord detector
├── docs/
│   └── accuracy-vs-chord-detector.md   # generated by score.mjs
├── storage/
│   ├── uploads/            # incoming audio (auto-cleaned post-job)
│   └── outputs/            # final .mid files (kept until you delete them)
├── models/                 # checkpoint cache (downloaded on first run)
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## Troubleshooting

- **`docker compose build` is slow on first run.** Expected — Torch + TF wheels are
  hundreds of MB each. Layers are cached after the first build.
- **Worker OOMs.** Demucs on CPU peaks at ~3–4 GB on a 4-min track. Raise Docker
  Desktop's memory limit, or set `DEMUCS_MODEL=mdx_extra_q` (smaller, slightly worse
  quality).
- **`omnizart` complains about missing checkpoints.** It downloads them lazily on
  first call; if the network is flaky inside the container, exec into the worker and
  run `omnizart download-checkpoints` manually.
