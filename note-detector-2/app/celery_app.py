"""Celery application factory.

Kept in its own module so both the FastAPI process (`app.main`) and the worker
process (`app.worker`) can `from app.celery_app import celery_app` without
creating a circular import.
"""
from celery import Celery

from app.config import settings


celery_app = Celery(
    "note_detector_2",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    # `include` is what lets the worker auto-discover tasks defined in app/worker.py.
    include=["app.worker"],
)

# Heavy ML jobs — give them room and recycle workers regularly so PyTorch / TF
# memory leaks (they exist!) don't accumulate over hours of uptime.
celery_app.conf.update(
    task_track_started=True,                 # so /status can distinguish "queued" vs "running"
    task_time_limit=60 * 30,                 # 30 min hard kill
    task_soft_time_limit=60 * 25,            # 25 min — task can catch SoftTimeLimitExceeded
    worker_max_tasks_per_child=4,            # recycle after N tasks to free model memory
    worker_prefetch_multiplier=1,            # don't grab extra jobs while one is running
    broker_connection_retry_on_startup=True, # Celery 6 deprecation: keep retry on boot
)
