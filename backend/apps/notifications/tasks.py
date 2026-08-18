try:
    from celery import shared_task
    task_decorator = shared_task
except ImportError:
    def task_decorator(func):
        return func

from .push_queue import process_pending_push_queue


@task_decorator
def retry_failed_push_notifications():
    return process_pending_push_queue()
