import { Vibration } from 'react-native';
import { handleStopAlertEvent, isHighPriorityNotificationType } from '../utils/trackingAlerts';
import { toastService } from '../services/toastService';

jest.mock('react-native', () => ({
  Vibration: { vibrate: jest.fn() },
}));

describe('trackingAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(toastService, 'error').mockImplementation(() => undefined);
    jest.spyOn(toastService, 'info').mockImplementation(() => undefined);
  });

  it('identifies high priority notification types', () => {
    expect(isHighPriorityNotificationType('stop_alert')).toBe(true);
    expect(isHighPriorityNotificationType('route_deviation')).toBe(true);
    expect(isHighPriorityNotificationType('order_completed')).toBe(false);
  });

  it('shows critical stop alert with stronger vibration', () => {
    handleStopAlertEvent({
      type: 'stop_alert',
      order_id: 12,
      level: 'critical',
      message: '15 daqiqadan beri turibdi',
    });

    expect(Vibration.vibrate).toHaveBeenCalledWith([0, 350, 150, 350]);
    expect(toastService.error).toHaveBeenCalledWith('15 daqiqadan beri turibdi');
  });

  it('shows warning stop alert with short vibration', () => {
    handleStopAlertEvent({
      type: 'stop_alert',
      order_id: 7,
      level: 'warning',
      message: '5 daqiqadan beri turibdi',
    });

    expect(Vibration.vibrate).toHaveBeenCalledWith(250);
    expect(toastService.info).toHaveBeenCalledWith('5 daqiqadan beri turibdi');
  });
});
