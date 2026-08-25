import { userCanAccessPlatform, userRequiresSubscription } from '../utils/account';
import type { User } from '../types';

jest.mock('../config/appConfig', () => ({
  SUBSCRIPTIONS_ENFORCED: false,
}));

const marketplaceUser: User = {
  id: 1,
  phone: '998901111111',
  first_name: 'Test',
  last_name: 'User',
  is_driver: true,
  is_client: false,
  is_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  account: {
    role: 'driver',
    is_staff: false,
    subscription_required: true,
    subscription_active: false,
    can_access_platform: false,
    trial: { enabled: true, remaining: 0, granted: 3, consumed: 3, disabled: false },
    driver_verification_required: false,
    company_inn_required: false,
    subscription: {
      required: true,
      active: false,
      expires_at: null,
      plan_code: null,
      plan_name: null,
      days_remaining: 0,
      has_access: false,
    },
  },
};

describe('account subscription helpers (disabled)', () => {
  it('does not require subscription when enforcement is off', () => {
    expect(userRequiresSubscription(marketplaceUser)).toBe(false);
  });

  it('allows platform access when enforcement is off', () => {
    expect(userCanAccessPlatform(marketplaceUser)).toBe(true);
  });
});
