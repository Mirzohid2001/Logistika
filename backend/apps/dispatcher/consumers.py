import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class DispatcherTrackingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope['user']
        is_dispatcher = getattr(self.user, 'is_dispatcher', False)
        is_staff = getattr(self.user, 'is_staff', False)
        if not self.user.is_authenticated or (not is_dispatcher and not is_staff):
            await self.close()
            return

        self.room_group_name = 'dispatcher_tracking'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            logger.warning(
                'Invalid dispatcher WebSocket payload',
                extra={'event': 'dispatcher_ws_invalid_json'},
            )

    async def location_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'location_update',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'lat': event['lat'],
            'lng': event['lng'],
            'speed_mps': event.get('speed_mps'),
            'heading': event.get('heading'),
            'raw_lat': event.get('raw_lat'),
            'raw_lng': event.get('raw_lng'),
            'snapped': event.get('snapped'),
            'route_offset_meters': event.get('route_offset_meters'),
            'route_progress_m': event.get('route_progress_m'),
            'updated_at': event['updated_at'],
            'status_code': event.get('status_code'),
            'tracking_summary': event.get('tracking_summary'),
            'estimated_eta_minutes': event.get('estimated_eta_minutes'),
            'driver_last_seen_at': event.get('driver_last_seen_at'),
            'driver_app_state': event.get('driver_app_state'),
            'driver_presence': event.get('driver_presence'),
        }))

    async def route_deviation(self, event):
        await self.send(text_data=json.dumps({
            'type': 'route_deviation',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'distance_meters': event.get('distance_meters'),
            'threshold_meters': event.get('threshold_meters'),
            'lat': event.get('lat'),
            'lng': event.get('lng'),
            'updated_at': event.get('updated_at'),
        }))

    async def geofence_event(self, event):
        await self.send(text_data=json.dumps({
            'type': 'geofence_event',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'event': event.get('event'),
            'lat': event.get('lat'),
            'lng': event.get('lng'),
            'message': event.get('message'),
            'title': event.get('title'),
            'stop_id': event.get('stop_id'),
            'sequence': event.get('sequence'),
            'stop_type': event.get('stop_type'),
            'label': event.get('label'),
            'notification_type': event.get('notification_type'),
            'updated_at': event.get('updated_at'),
        }))

    async def route_stop_arrived(self, event):
        await self.send(text_data=json.dumps(event))

    async def route_stop_completed(self, event):
        await self.send(text_data=json.dumps(event))

    async def ops_refresh(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ops_refresh',
            'reason': event.get('reason', 'update'),
            'updated_at': event.get('updated_at'),
        }))

    async def stop_alert(self, event):
        await self.send(text_data=json.dumps(event))

    async def driver_sos(self, event):
        await self.send(text_data=json.dumps({
            'type': 'driver_sos',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'lat': event.get('lat'),
            'lng': event.get('lng'),
            'message': event.get('message'),
            'status': event.get('status'),
            'updated_at': event.get('updated_at'),
        }))

    async def order_status_changed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_status_changed',
            'order_id': event['order_id'],
            'status_code': event.get('status_code'),
            'status_name': event.get('status_name'),
            'message': event.get('message'),
            'updated_at': event.get('updated_at'),
            'is_fully_paid': event.get('is_fully_paid'),
            'remaining_amount': event.get('remaining_amount'),
        }))

    async def order_payment_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_payment_updated',
            'order_id': event['order_id'],
            'is_fully_paid': event.get('is_fully_paid'),
            'remaining_amount': event.get('remaining_amount'),
            'paid_amount': event.get('paid_amount'),
            'total_amount': event.get('total_amount'),
            'updated_at': event.get('updated_at'),
        }))

    async def order_client_payment_confirmed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_client_payment_confirmed',
            'order_id': event['order_id'],
            'client_payment_confirmed': event.get('client_payment_confirmed'),
            'client_payment_confirmed_at': event.get('client_payment_confirmed_at'),
            'updated_at': event.get('updated_at'),
        }))


class OrderTrackingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope['user']
        self.order_id = self.scope['url_route']['kwargs'].get('order_id')
        if not self.user.is_authenticated or not await self._can_access_order():
            await self.close()
            return
        self.room_group_name = f'order_tracking_{self.order_id}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            logger.warning(
                'Invalid dispatcher WebSocket payload',
                extra={'event': 'dispatcher_ws_invalid_json'},
            )

    async def location_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'location_update',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'lat': event['lat'],
            'lng': event['lng'],
            'speed_mps': event.get('speed_mps'),
            'heading': event.get('heading'),
            'raw_lat': event.get('raw_lat'),
            'raw_lng': event.get('raw_lng'),
            'snapped': event.get('snapped'),
            'route_offset_meters': event.get('route_offset_meters'),
            'route_progress_m': event.get('route_progress_m'),
            'updated_at': event['updated_at'],
            'status_code': event.get('status_code'),
            'tracking_summary': event.get('tracking_summary'),
            'estimated_eta_minutes': event.get('estimated_eta_minutes'),
            'driver_last_seen_at': event.get('driver_last_seen_at'),
            'driver_app_state': event.get('driver_app_state'),
            'driver_presence': event.get('driver_presence'),
        }))

    async def route_deviation(self, event):
        await self.send(text_data=json.dumps(event))

    async def geofence_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def route_stop_arrived(self, event):
        await self.send(text_data=json.dumps(event))

    async def route_stop_completed(self, event):
        await self.send(text_data=json.dumps(event))

    async def stop_alert(self, event):
        await self.send(text_data=json.dumps(event))

    async def driver_sos(self, event):
        await self.send(text_data=json.dumps({
            'type': 'driver_sos',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'lat': event.get('lat'),
            'lng': event.get('lng'),
            'message': event.get('message'),
            'status': event.get('status'),
            'updated_at': event.get('updated_at'),
        }))

    async def order_status_changed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_status_changed',
            'order_id': event['order_id'],
            'status_code': event.get('status_code'),
            'status_name': event.get('status_name'),
            'message': event.get('message'),
            'updated_at': event.get('updated_at'),
            'is_fully_paid': event.get('is_fully_paid'),
            'remaining_amount': event.get('remaining_amount'),
        }))

    async def order_payment_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_payment_updated',
            'order_id': event['order_id'],
            'is_fully_paid': event.get('is_fully_paid'),
            'remaining_amount': event.get('remaining_amount'),
            'paid_amount': event.get('paid_amount'),
            'total_amount': event.get('total_amount'),
            'updated_at': event.get('updated_at'),
        }))

    async def order_client_payment_confirmed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'order_client_payment_confirmed',
            'order_id': event['order_id'],
            'client_payment_confirmed': event.get('client_payment_confirmed'),
            'client_payment_confirmed_at': event.get('client_payment_confirmed_at'),
            'updated_at': event.get('updated_at'),
        }))

    @database_sync_to_async
    def _can_access_order(self):
        from apps.orders.models import Order
        from apps.users.permissions import can_access_order
        try:
            order = Order.objects.select_related('driver', 'client').get(pk=self.order_id)
        except Order.DoesNotExist:
            return False
        return can_access_order(self.user, order)
