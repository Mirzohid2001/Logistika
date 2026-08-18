import { canManuallyCompleteStop, canSkipStop, getSortedRouteStops } from '../utils/routeStops';
import type { OrderRouteStop } from '../types';

function stop(partial: Partial<OrderRouteStop> & Pick<OrderRouteStop, 'id' | 'sequence'>): OrderRouteStop {
  return {
    stop_type: 'delivery',
    label: '',
    address: '',
    status: 'pending',
    ...partial,
  };
}

describe('routeStops skip and complete gates', () => {
  const pickup = stop({ id: 1, sequence: 1, stop_type: 'pickup', status: 'pending' });
  const middle = stop({ id: 2, sequence: 2, stop_type: 'delivery', status: 'pending' });
  const last = stop({ id: 3, sequence: 3, stop_type: 'delivery', status: 'pending' });
  const stops = [pickup, middle, last];

  it('allows complete only after arrival', () => {
    expect(canManuallyCompleteStop(pickup)).toBe(false);
    expect(canManuallyCompleteStop({ ...pickup, status: 'arrived' })).toBe(true);
    expect(canManuallyCompleteStop({ ...middle, lat: null, lng: null, status: 'pending' })).toBe(false);
  });

  it('allows skip only for intermediate deliveries', () => {
    expect(canSkipStop(pickup, stops)).toBe(false);
    expect(canSkipStop(middle, stops)).toBe(true);
    expect(canSkipStop(last, stops)).toBe(false);
  });

  it('does not skip completed or skipped stops', () => {
    expect(canSkipStop({ ...middle, status: 'completed' }, stops)).toBe(false);
    expect(canSkipStop({ ...middle, status: 'skipped' }, stops)).toBe(false);
  });

  it('sorts stops by sequence', () => {
    expect(getSortedRouteStops([last, pickup, middle]).map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
