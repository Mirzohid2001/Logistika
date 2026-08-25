import { createContext } from 'react';

export interface ChatBadgeContextType {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

/** Alohida modul — Fast Refresh Provider'ni yangilaganda context identity saqlanadi. */
export const ChatBadgeContext = createContext<ChatBadgeContextType | undefined>(undefined);

export const EMPTY_CHAT_BADGE: ChatBadgeContextType = {
  unreadCount: 0,
  refreshUnreadCount: async () => {},
};
