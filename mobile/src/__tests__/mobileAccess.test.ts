import { isDispatcherAccount } from '../utils/account';
import type { User } from '../types';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  phone: '+998901234567',
  first_name: 'Test',
  last_name: 'User',
  is_driver: false,
  is_client: true,
  is_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('mobile account access', () => {
  it('rejects dispatcher accounts', () => {
    expect(isDispatcherAccount(makeUser({ is_dispatcher: true }))).toBe(true);
  });

  it('keeps client, driver and updater accounts available', () => {
    expect(isDispatcherAccount(makeUser())).toBe(false);
    expect(isDispatcherAccount(makeUser({ is_client: false, is_driver: true }))).toBe(false);
    expect(isDispatcherAccount(makeUser({ is_client: false, is_updater: true }))).toBe(false);
  });
});
