import unittest

from bus_timing import bus_weights, interpolate
from transport_geometry import GATES


class BusTimingTests(unittest.TestCase):
    def test_preserves_published_timepoints_across_midnight(self):
        self.assertEqual(interpolate([1430, None, 5, None, 30], [1, 2, 3, 2]), [0, 5, 15, 30, 40])

    def test_does_not_use_reverse_alignment_as_ordered_geometry(self):
        stops = [(22.3, 114.1), (22.3, 114.11), (22.3, 114.12)]
        reverse = [stops[::-1]]
        pickup = dropoff = [0, 0, 0]
        self.assertEqual(bus_weights(stops, reverse, pickup, dropoff), bus_weights(stops, [], pickup, dropoff))

    def test_fast_checkpoint_and_stop_allowance_have_separate_effects(self):
        lat, lon = next((lat, lon) for key, lat, lon, _ in GATES if key == 'tolo')
        stops = [(lat, lon - 0.01), (lat, lon + 0.01), (lat, lon + 0.015)]
        alignment = [[stops[0], (lat, lon), *stops[1:]]]
        served = [0, 0, 0]
        bypassed = [0, 1, 0]
        fast = bus_weights(stops, alignment, served, served)
        local = bus_weights(stops, [], served, served)
        self.assertLess(fast[0], local[0])
        self.assertAlmostEqual(fast[1], local[1], places=4)
        self.assertAlmostEqual(fast[0] - bus_weights(stops, alignment, bypassed, bypassed)[0], 0.4)


if __name__ == '__main__':
    unittest.main()
