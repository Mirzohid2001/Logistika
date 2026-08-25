import json
from unittest import TestCase
from unittest.mock import AsyncMock

from asgiref.sync import async_to_sync

from apps.dispatcher.consumers import DispatcherTrackingConsumer, OrderTrackingConsumer


class LocationConsumerPayloadTests(TestCase):
    def _assert_motion_payload(self, consumer_class):
        consumer = consumer_class()
        consumer.send = AsyncMock()
        event = {
            'type': 'location_update',
            'order_id': 7,
            'driver_id': 11,
            'lat': 41.3,
            'lng': 69.24,
            'speed_mps': 12.5,
            'heading': 91.0,
            'raw_lat': 41.3002,
            'raw_lng': 69.2402,
            'snapped': True,
            'route_offset_meters': 4.2,
            'route_progress_m': 230.0,
            'updated_at': '2026-08-25T10:00:00Z',
            'status_code': 'in_transit',
            'tracking_summary': {},
            'estimated_eta_minutes': 12,
            'driver_last_seen_at': '2026-08-25T10:00:00Z',
            'driver_app_state': 'foreground',
            'driver_presence': {'status': 'online'},
        }

        async_to_sync(consumer.location_update)(event)

        consumer.send.assert_awaited_once()
        payload = json.loads(consumer.send.await_args.kwargs['text_data'])
        self.assertEqual(payload['speed_mps'], 12.5)
        self.assertEqual(payload['heading'], 91.0)
        self.assertTrue(payload['snapped'])
        self.assertEqual(payload['route_progress_m'], 230.0)
        self.assertEqual(payload['route_offset_meters'], 4.2)

    def test_dispatcher_consumer_forwards_motion_fields(self):
        self._assert_motion_payload(DispatcherTrackingConsumer)

    def test_order_consumer_forwards_motion_fields(self):
        self._assert_motion_payload(OrderTrackingConsumer)
