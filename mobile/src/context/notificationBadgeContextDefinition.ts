import { createContext } from 'react';

export interface NotificationBadgeContextType {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

/** Alohida modul — Fast Refresh Provider'ni yangilaganda context identity saqlanadi. */
export const NotificationBadgeContext = createContext<NotificationBadgeContextType | undefined>(
  undefined,
);

export const EMPTY_NOTIFICATION_BADGE: NotificationBadgeContextType = {
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  setUnreadCount: () => {},
};
