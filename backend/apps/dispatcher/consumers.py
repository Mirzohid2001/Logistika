import json
from channels.generic.websocket import AsyncWebsocketConsumer


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
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            pass

    async def location_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'location_update',
            'order_id': event['order_id'],
            'driver_id': event['driver_id'],
            'lat': event['lat'],
            'lng': event['lng'],
            'updated_at': event['updated_at'],
            'status_code': event.get('status_code'),
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
            'updated_at': event.get('updated_at'),
        }))

    async def ops_refresh(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ops_refresh',
            'reason': event.get('reason', 'update'),
            'updated_at': event.get('updated_at'),
        }))
