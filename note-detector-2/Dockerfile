# Dockerfile — single image used for both the FastAPI API and the Celery worker.
# Python 3.10 — basic-pitch (Spotify's transcription model) supports 3.8-3.11;
# 3.10 is the modern sweet spot with broad wheel availability for torch + TF.

FROM python:3.10-slim AS base

# System libs: ffmpeg for audio decoding, libsndfile for soundfile, sox for resampling, git
# in case any pip dep resolves to a git+ URL, build-essential for any C extensions.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libsndfile1 \
      libsox-dev \
      sox \
      git \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

# --- Heavy ML deps installed in dedicated layers so they're cached across rebuilds ---

# 1. PyTorch. On Apple Silicon (linux/arm64) the default PyPI wheel is already
#    CPU-only — there's no CUDA build for aarch64 — so we don't need a special
#    index URL. On x86_64, set `--index-url https://download.pytorch.org/whl/cpu`
#    AND switch the versions to `torch==2.4.1+cpu` etc. to avoid the ~2 GB CUDA wheel.
#    Pinning here keeps Demucs from pulling a different (much larger) version.
# setuptools<81: setuptools 81 removed `pkg_resources` (deprecated since 80),
# and `pretty_midi 0.2.10` still imports it. Pin until pretty_midi cuts a release
# that uses importlib.metadata.
RUN pip install --upgrade pip wheel "setuptools<81" && \
    pip install \
      torch==2.4.1 \
      torchaudio==2.4.1

# 2. The rest of the application requirements (Demucs + basic-pitch — basic-pitch
#    pulls in TensorFlow for the ICASSP 2022 model checkpoint).
COPY requirements.txt .
RUN pip install -r requirements.txt

# 3. App code last so dep layers stay cached on iteration.
COPY app/ ./app/

# Pre-create runtime dirs. Volume mounts will overlay these at run time, but having
# them in the image means the worker can still write if you forget the mount.
RUN mkdir -p /code/storage/uploads /code/storage/outputs /code/models

EXPOSE 8000

# Default command is overridden by docker-compose for each service (api / worker).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
