import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

export type MarketplaceRole = 'client' | 'driver';

const ACTIVE_ROLE_KEY = '@logistika_active_marketplace_role';

export function getAvailableMarketplaceRoles(user: User | null): MarketplaceRole[] {
  if (!user) {
    return [];
  }
  const roles: MarketplaceRole[] = [];
  if (user.is_client) {
    roles.push('client');
  }
  if (user.is_driver) {
    roles.push('driver');
  }
  return roles;
}

export function canSwitchMarketplaceRole(user: User | null): boolean {
  return getAvailableMarketplaceRoles(user).length > 1;
}

export async function getStoredActiveMarketplaceRole(): Promise<MarketplaceRole | null> {
  const value = await AsyncStorage.getItem(ACTIVE_ROLE_KEY);
  if (value === 'client' || value === 'driver') {
    return value;
  }
  return null;
}

export async function setStoredActiveMarketplaceRole(role: MarketplaceRole): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ROLE_KEY, role);
}

export async function resolveActiveMarketplaceRole(user: User | null): Promise<MarketplaceRole | null> {
  const available = getAvailableMarketplaceRoles(user);
  if (available.length === 0) {
    return null;
  }
  if (available.length === 1) {
    return available[0];
  }
  const stored = await getStoredActiveMarketplaceRole();
  if (stored && available.includes(stored)) {
    return stored;
  }
  return available[0];
}

export function resolveStaffRole(user: User | null): 'dispatcher' | 'updater' | null {
  if (!user) {
    return null;
  }
  if (user.is_dispatcher) {
    return 'dispatcher';
  }
  if (user.is_updater) {
    return 'updater';
  }
  return null;
}
