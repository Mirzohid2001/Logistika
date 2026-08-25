import React, { useContext, useState, useEffect, ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import i18n from '../i18n';
import { User } from '../types';
import { authService } from '../services/authService';
import { pushNotificationService } from '../services/pushNotificationService';
import { ErrorCode } from '../services/errorService';
import { authSessionService } from '../services/authSessionService';
import { SUBSCRIPTIONS_ENFORCED } from '../config/appConfig';
import { userCanAccessPlatform, userRequiresSubscription } from '../utils/account';
import {
  canSwitchMarketplaceRole,
  resolveActiveMarketplaceRole,
  resolveStaffRole,
  setStoredActiveMarketplaceRole,
  type MarketplaceRole,
} from '../utils/marketplaceRole';
import { AuthContext, type AuthContextType } from './authContextDefinition';

export type { AuthContextType };

const isRateLimitedError = (error: any): boolean =>
  error?.code === ErrorCode.RATE_LIMITED || error?.statusCode === 429;

const isAuthError = (error: any): boolean =>
  error?.code === ErrorCode.AUTHENTICATION_ERROR || error?.statusCode === 401;

const USER_REFRESH_MIN_INTERVAL_MS = 45_000;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMarketplaceRole, setActiveMarketplaceRoleState] = useState<MarketplaceRole | null>(null);
  const userRef = React.useRef<User | null>(null);
  const isLoadingRef = React.useRef<boolean>(true);
  const lastUserRefreshAtRef = React.useRef(0);
  const userRefreshInFlightRef = React.useRef<Promise<void> | null>(null);

  const syncActiveMarketplaceRole = React.useCallback(async (nextUser: User | null) => {
    if (resolveStaffRole(nextUser)) {
      setActiveMarketplaceRoleState(null);
      return;
    }
    const role = await resolveActiveMarketplaceRole(nextUser);
    setActiveMarketplaceRoleState(role);
  }, []);

  const setActiveMarketplaceRole = React.useCallback(async (role: MarketplaceRole) => {
    await setStoredActiveMarketplaceRole(role);
    setActiveMarketplaceRoleState(role);
  }, []);

  useEffect(() => {
    userRef.current = user;
    isLoadingRef.current = isLoading;
    pushNotificationService.setUser(user);
  }, [user, isLoading]);

  useEffect(() => {
    const unsubscribeSubscription = authSessionService.onSubscriptionRequired(async () => {
      if (!SUBSCRIPTIONS_ENFORCED) {
        return;
      }
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        await authService.saveUser(currentUser);
      } catch {
        const storedUser = await authService.getStoredUser();
        if (storedUser) {
          const patched = {
            ...storedUser,
            subscription: storedUser.subscription
              ? { ...storedUser.subscription, required: true, active: false }
              : {
                  required: true,
                  active: false,
                  expires_at: null,
                  plan_code: null,
                  plan_name: null,
                  days_remaining: null,
                },
            account: storedUser.account
              ? { ...storedUser.account, subscription_active: false, can_access_platform: false }
              : storedUser.account,
          };
          setUser(patched);
          await authService.saveUser(patched);
        }
      }
    });

    return unsubscribeSubscription;
  }, []);

  useEffect(() => {
    const unsubscribe = authSessionService.onSessionExpired(async () => {
      await authService.logout();
      setUser(null);

      if (!isLoadingRef.current && userRef.current) {
        Alert.alert(i18n.t('session.expiredTitle'), i18n.t('session.expiredMessage'));
      }
    });

    return unsubscribe;
  }, []);

  const loadUser = React.useCallback(async () => {
    try {
      const token = await authService.isAuthenticated();
      if (token) {
        try {
          const currentUser = await authService.getCurrentUser();
          setUser(currentUser);
          await authService.saveUser(currentUser);
          await syncActiveMarketplaceRole(currentUser);
        } catch (error: any) {
          if (isAuthError(error)) {
            await authService.logout();
            setUser(null);
            return;
          }

          if (
            error?.isNetworkError ||
            error?.message?.includes('Internetga ulanib bo\'lmadi') ||
            isRateLimitedError(error)
          ) {
            if (__DEV__) {
              console.warn('Using stored user after profile fetch issue:', error?.code || error?.message);
            }
          } else if (__DEV__) {
            console.warn('Error fetching current user:', error);
          }
          const storedUser = await authService.getStoredUser();
          if (storedUser) {
            setUser(storedUser);
            await syncActiveMarketplaceRole(storedUser);
          }
        }
      } else {
        const storedUser = await authService.getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Error loading user:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [syncActiveMarketplaceRole]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = async (phone: string, password: string) => {
    const response = await authService.login(phone, password);
    setUser(response.user);
    await authService.saveUser(response.user);
    await syncActiveMarketplaceRole(response.user);

    if (userCanAccessPlatform(response.user)) {
      await pushNotificationService.updateFCMToken(response.user);
    }
  };

  const completeTelegramAuth = async (ticket: string) => {
    const response = await authService.completeTelegramAuth(ticket);
    setUser(response.user);
    await authService.saveUser(response.user);
    await syncActiveMarketplaceRole(response.user);

    if (userCanAccessPlatform(response.user)) {
      await pushNotificationService.updateFCMToken(response.user);
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setActiveMarketplaceRoleState(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    void authService.saveUser(updatedUser);
  };

  const refreshUser = React.useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (
      !options?.force &&
      now - lastUserRefreshAtRef.current < USER_REFRESH_MIN_INTERVAL_MS
    ) {
      return;
    }

    if (userRefreshInFlightRef.current) {
      return userRefreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        lastUserRefreshAtRef.current = Date.now();
        setUser(currentUser);
        await authService.saveUser(currentUser);
        await syncActiveMarketplaceRole(currentUser);
        if (userCanAccessPlatform(currentUser)) {
          await pushNotificationService.updateFCMToken(currentUser);
        }
      } catch (error: any) {
        if (isAuthError(error)) {
          await authService.logout();
          setUser(null);
          return;
        }
        if (__DEV__ && !isRateLimitedError(error)) {
          console.warn('Error refreshing user:', error);
        }
      } finally {
        userRefreshInFlightRef.current = null;
      }
    })();

    userRefreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [syncActiveMarketplaceRole]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && userRef.current) {
        refreshUser();
      }
    });
    return () => subscription.remove();
  }, [refreshUser]);

  const needsSubscription = userRequiresSubscription(user);
  const hasActiveSubscription = userCanAccessPlatform(user);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    needsSubscription,
    hasActiveSubscription,
    activeMarketplaceRole,
    canSwitchMarketplaceRole: canSwitchMarketplaceRole(user),
    setActiveMarketplaceRole,
    login,
    completeTelegramAuth,
    logout,
    updateUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Fast Refresh ba'zan Provider va hookni vaqtincha ajratadi.
    // To'liq reload (Cmd+R) odatda tiklaydi; productionda bu AuthProvider yo'qligini bildiradi.
    throw new Error(
      'useAuth must be used within an AuthProvider. If this appeared after Hot Reload, do a full app reload.',
    );
  }
  return context;
};
