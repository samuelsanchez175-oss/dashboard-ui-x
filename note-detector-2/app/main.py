"""FastAPI surface for note-detector-2.

    POST /transcribe         -> save upload, enqueue job, return task_id
    GET  /status/{task_id}   -> Queued | Processing | Completed | Failed
    GET  /download/{task_id} -> serve the merged .mid
    GET  /                   -> liveness

The API process must NOT do any heavy ML work itself — anything that takes more
than a few hundred ms is handed off to Celery so requests never time out.
"""
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from celery.result import AsyncResult

from app.celery_app import celery_app
from app.config import settings
from app.worker import run_transcription_pipeline


app = FastAPI(
    title="Note Detector 2",
    version="0.1.0",
    description="Audio → stems → MIDI. Separate from the existing chord-detector tool.",
)

# CORS — let the dashboard UI (any localhost port — Vite picks 5173/5175/etc.
# dynamically) call the service from the browser. No credentials, so a regex
# match on localhost origins is safe; tighten in production.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Audio content types we'll accept directly. Stay loose — browsers and curl pick
# different ones for the same file (e.g. .m4a may be sent as audio/mp4 OR
# application/octet-stream). We fall back to the filename extension below.
ALLOWED_AUDIO_CT = {
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/mpeg", "audio/mp3",
    "audio/flac", "audio/x-flac",
    "audio/ogg",
    "audio/aac", "audio/mp4", "audio/x-m4a",
}
ALLOWED_AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}


@app.get("/")
def health() -> dict:
    """Liveness probe."""
    return {"service": "note-detector-2", "status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> JSONResponse:
    """Accept an audio upload, persist it, dispatch the Celery job, return its id.

    The function is `async` so FastAPI can stream the upload to disk in 1 MB
    chunks without buffering a multi-hundred-MB file in memory.
    """
    suffix = Path(file.filename or "input.wav").suffix.lower() or ".wav"

    if file.content_type not in ALLOWED_AUDIO_CT and suffix not in ALLOWED_AUDIO_EXT:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio: content-type={file.content_type!r}, ext={suffix!r}",
        )

    # Unique id per upload — prevents collisions between concurrent jobs that
    # happen to share a filename.
    job_id = uuid.uuid4().hex
    saved_path = settings.upload_dir / f"{job_id}{suffix}"

    with saved_path.open("wb") as fh:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            fh.write(chunk)

    # Fire-and-forget. Celery returns immediately; the heavy lifting happens in
    # the worker process.
    task = run_transcription_pipeline.apply_async(args=[str(saved_path), job_id])

    return JSONResponse(
        {
            "task_id": task.id,
            "job_id": job_id,
            "status": "Queued",
        }
    )


@app.get("/status/{task_id}")
def status(task_id: str) -> JSONResponse:
    """Return the normalised job state for the client.

    Celery's raw states (PENDING / STARTED / SUCCESS / FAILURE / RETRY / REVOKED)
    are collapsed into the four the brief asked for: Queued / Processing /
    Completed / Failed.
    """
    result = AsyncResult(task_id, app=celery_app)
    state = result.state

    if state == "SUCCESS":
        info = result.result if isinstance(result.result, dict) else {}
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "Completed",
                "stage": info.get("stage", "done"),
                "stems": info.get("stems", []),
                "download_url": f"{settings.api_base_url}/download/{task_id}",
            }
        )

    if state == "FAILURE":
        # `result.info` is the exception instance Celery captured.
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "Failed",
                "error": str(result.info),
            }
        )

    # PENDING in Celery can mean "queued" OR "unknown task id" — we can't tell
    # them apart without a DB. Treat both as Queued/Processing for the client.
    info = result.info if isinstance(result.info, dict) else {}
    return JSONResponse(
        {
            "task_id": task_id,
            "status": "Queued" if state == "PENDING" else "Processing",
            "stage": info.get("stage", state.lower()),
        }
    )


@app.get("/download/{task_id}")
def download(task_id: str) -> FileResponse:
    """Stream the merged MIDI file for a completed job."""
    result = AsyncResult(task_id, app=celery_app)
    if result.state != "SUCCESS":
        raise HTTPException(status_code=404, detail="Result not ready")

    info = result.result if isinstance(result.result, dict) else {}
    midi_path = info.get("midi_path")
    if not midi_path or not Path(midi_path).exists():
        raise HTTPException(status_code=404, detail="MIDI file missing on disk")

    return FileResponse(
        midi_path,
        media_type="audio/midi",
        filename=Path(midi_path).name,
    )
