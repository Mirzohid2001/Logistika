import React, { useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { notificationService } from '../services/notificationService';
import { useAuth } from './AuthContext';
import {
  EMPTY_NOTIFICATION_BADGE,
  NotificationBadgeContext,
  type NotificationBadgeContextType,
} from './notificationBadgeContextDefinition';

export type { NotificationBadgeContextType };

export const NotificationBadgeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, hasActiveSubscription } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !hasActiveSubscription) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await notificationService.getUnreadCount();
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // Badge is non-critical; keep previous value.
    }
  }, [isAuthenticated, hasActiveSubscription]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <NotificationBadgeContext.Provider value={{ unreadCount, refreshUnreadCount, setUnreadCount }}>
      {children}
    </NotificationBadgeContext.Provider>
  );
};

export const useNotificationBadge = () => {
  return useContext(NotificationBadgeContext) ?? EMPTY_NOTIFICATION_BADGE;
};
