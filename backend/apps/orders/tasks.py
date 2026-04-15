from django.utils import timezone
from django.conf import settings
from django.db.models import Sum
from datetime import timedelta
import csv
import os
from .models import Order, OrderStatus, OrderLocationTrack
from apps.common.services import send_notification_sms
from apps.payments.models import Payment

try:
    from celery import shared_task
    task_decorator = shared_task
except ImportError:
    def task_decorator(func):
        return func


@task_decorator
def update_active_order_locations():
    in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
    if not in_progress_status:
        return
    
    active_orders = Order.objects.filter(status=in_progress_status)
    
    for order in active_orders:
        if not order.current_location_lat or not order.current_location_lng:
            continue
            
        last_track = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp').first()
        
        if not last_track:
            OrderLocationTrack.objects.create(
                order=order,
                lat=order.current_location_lat,
                lng=order.current_location_lng
            )
        else:
            time_since_last_update = timezone.now() - last_track.timestamp
            if time_since_last_update >= timedelta(minutes=10):
                OrderLocationTrack.objects.create(
                    order=order,
                    lat=order.current_location_lat,
                    lng=order.current_location_lng
                )


@task_decorator
def check_stopped_drivers():
    in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
    if not in_progress_status:
        return
    
    active_orders = Order.objects.filter(status=in_progress_status)
    
    for order in active_orders:
        last_track = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp').first()
        
        if not last_track:
            continue
        
        time_since_last_update = timezone.now() - last_track.timestamp
        
        if time_since_last_update >= timedelta(minutes=5):
            try:
                client_phone = order.client.phone
                driver_name = f"{order.driver.first_name} {order.driver.last_name}"
                message = f"Diqqat! Haydovchi {driver_name} 5 daqiqadan ko'proq vaqt davomida harakatlanmayapti. Buyurtma #{order.id}"
                send_notification_sms(client_phone, message)
            except Exception as e:
                print(f"Error sending notification: {e}")


def _write_ops_report(filename_prefix, since_dt):
    reports_dir = os.path.join(settings.MEDIA_ROOT, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    now = timezone.now()
    dated_name = f"{filename_prefix}_{now.strftime('%Y%m%d_%H%M%S')}.csv"
    latest_name = f"{filename_prefix}_latest.csv"
    dated_path = os.path.join(reports_dir, dated_name)
    latest_path = os.path.join(reports_dir, latest_name)

    active_orders = Order.objects.filter(
        status__code__in=['pending', 'approved_by_client', 'in_progress', 'in_transit'],
        updated_at__gte=since_dt,
    )
    completed_orders = Order.objects.filter(status__code='completed', updated_at__gte=since_dt)
    problem_orders = Order.objects.filter(status__code__in=['rejected', 'stopped', 'cancelled'], updated_at__gte=since_dt)
    completed_payments = Payment.objects.filter(payment_status='completed', created_at__gte=since_dt)

    headers = ["metric", "value"]
    rows = [
        ["generated_at", timezone.localtime(now).strftime('%Y-%m-%d %H:%M:%S')],
        ["range_start", timezone.localtime(since_dt).strftime('%Y-%m-%d %H:%M:%S')],
        ["active_orders", active_orders.count()],
        ["completed_orders", completed_orders.count()],
        ["problem_orders", problem_orders.count()],
        ["payments_completed_count", completed_payments.count()],
        ["payments_completed_amount", completed_payments.aggregate(total_sum=Sum('amount')).get('total_sum') or 0],
    ]

    for path in [dated_path, latest_path]:
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(rows)


@task_decorator
def generate_daily_operations_report():
    _write_ops_report("daily_operations_report", timezone.now() - timedelta(days=1))


@task_decorator
def generate_weekly_operations_report():
    _write_ops_report("weekly_operations_report", timezone.now() - timedelta(days=7))

