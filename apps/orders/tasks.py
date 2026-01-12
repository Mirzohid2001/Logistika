from django.utils import timezone
from datetime import timedelta
from .models import Order, OrderStatus, OrderLocationTrack

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

