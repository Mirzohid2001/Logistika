from django.test import SimpleTestCase

from apps.orders.map_match import (
    get_match_polyline,
    normalize_route_points,
    snap_to_route,
)


class MapMatchTests(SimpleTestCase):
    def test_normalize_route_points_drops_bad_and_dupes(self):
        points = [
            {'lat': 41.0, 'lng': 69.0},
            {'lat': 41.0, 'lng': 69.0},
            {'latitude': 41.01, 'longitude': 69.01},
            {'lat': 'bad', 'lng': 1},
            [41.02, 69.02],
        ]
        normalized = normalize_route_points(points)
        self.assertEqual(len(normalized), 3)
        self.assertEqual(normalized[0], (41.0, 69.0))
        self.assertEqual(normalized[-1], (41.02, 69.02))

    def test_snap_pulls_point_onto_eastbound_segment(self):
        route = [
            (41.3000, 69.2400),
            (41.3000, 69.2500),
        ]
        # ~55m north of the segment midline
        result = snap_to_route(41.3005, 69.2450, route, max_snap_meters=100)
        self.assertIsNotNone(result)
        self.assertTrue(result.snapped)
        self.assertAlmostEqual(result.lat, 41.3000, places=4)
        self.assertAlmostEqual(result.lng, 69.2450, places=4)
        self.assertAlmostEqual(result.heading or 0, 90.0, delta=5.0)
        self.assertLess(result.distance_m, 80)

    def test_snap_keeps_raw_when_far_off_route(self):
        route = [
            (41.3000, 69.2400),
            (41.3000, 69.2500),
        ]
        result = snap_to_route(41.3100, 69.2450, route, max_snap_meters=80)
        self.assertIsNotNone(result)
        self.assertFalse(result.snapped)
        self.assertEqual(result.lat, 41.3100)
        self.assertEqual(result.lng, 69.2450)

    def test_snap_prefers_forward_progress(self):
        # Long eastbound route (~2km): without progress preference a mid GPS
        # near the start duplicate would snap early; with previous_progress near
        # the far end we stay ahead.
        route = [
            (41.3000, 69.2400),
            (41.3000, 69.2500),
            (41.3000, 69.2600),
        ]
        near_end = snap_to_route(
            41.30005,
            69.2590,
            route,
            previous_progress_m=1400,
            backtrack_tolerance_m=40,
            max_snap_meters=200,
        )
        near_start = snap_to_route(
            41.30005,
            69.2410,
            route,
            previous_progress_m=None,
            max_snap_meters=200,
        )
        self.assertIsNotNone(near_end)
        self.assertIsNotNone(near_start)
        self.assertGreater(near_end.progress_m, near_start.progress_m)
        self.assertGreater(near_end.progress_m, 1200)

    def test_get_match_polyline_prefers_optimized(self):
        class FakeOrder:
            optimized_route_polyline = [{'lat': 41.0, 'lng': 69.0}, {'lat': 41.1, 'lng': 69.1}]
            planned_route_points = [{'lat': 40.0, 'lng': 68.0}, {'lat': 40.1, 'lng': 68.1}]

        polyline = get_match_polyline(FakeOrder())
        self.assertEqual(polyline[0], (41.0, 69.0))
