from celery import shared_task

from apps.users.document_expiry import process_driver_document_expiry_reminders


@shared_task(name='apps.users.tasks.check_driver_document_expiry')
def check_driver_document_expiry():
    return process_driver_document_expiry_reminders()
