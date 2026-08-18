import type { User, UserSubscriptionStatus } from '../types';
import { userCanAccessPlatform, userRequiresSubscription } from './account';

export function userNeedsSubscription(user: User | null | undefined): boolean {
  return userRequiresSubscription(user);
}

export function userHasActiveSubscription(user: User | null | undefined): boolean {
  return userCanAccessPlatform(user);
}

export function getSubscriptionStatus(user: User | null | undefined): UserSubscriptionStatus | null {
  return user?.subscription ?? null;
}
