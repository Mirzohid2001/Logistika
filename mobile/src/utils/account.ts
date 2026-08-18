import type { User, UserAccountStatus } from '../types';
import { SUBSCRIPTIONS_ENFORCED } from '../config/appConfig';

export type MarketplaceRole = 'client' | 'driver';

export function isStaffAccount(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.account?.is_staff) return true;
  return Boolean(
    user.is_dispatcher ||
      user.is_updater ||
      user.is_operator ||
      user.is_admin,
  );
}

export function getMarketplaceRole(user: User | null | undefined): MarketplaceRole | null {
  if (!user || isStaffAccount(user)) return null;
  if (user.marketplace_role === 'client' || user.marketplace_role === 'driver') {
    return user.marketplace_role;
  }
  if (user.is_driver) return 'driver';
  if (user.is_client) return 'client';
  return null;
}

export function getAccountStatus(user: User | null | undefined): UserAccountStatus | null {
  return user?.account ?? null;
}

export function userRequiresSubscription(user: User | null | undefined): boolean {
  if (!SUBSCRIPTIONS_ENFORCED) return false;
  if (!user) return false;
  const account = getAccountStatus(user);
  if (account) return account.subscription_required;
  if (isStaffAccount(user)) return false;
  return getMarketplaceRole(user) != null;
}

export function userCanAccessPlatform(user: User | null | undefined): boolean {
  if (!SUBSCRIPTIONS_ENFORCED) return Boolean(user);
  if (!user) return false;
  const account = getAccountStatus(user);
  if (account) return account.can_access_platform;
  if (isStaffAccount(user)) return true;
  if (!userRequiresSubscription(user)) return true;
  return Boolean(user.subscription?.active);
}

export function driverNeedsVerification(user: User | null | undefined): boolean {
  if (!user?.is_driver) return false;
  if (user.verification_status) {
    return user.verification_status !== 'approved';
  }
  const account = getAccountStatus(user);
  if (account) return account.driver_verification_required;
  return getMarketplaceRole(user) === 'driver' && !user?.is_verified;
}
