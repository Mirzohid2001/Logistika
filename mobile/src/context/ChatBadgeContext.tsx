import React, { useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { chatService } from '../services/chatService';
import { useAuth } from './AuthContext';
import {
  ChatBadgeContext,
  EMPTY_CHAT_BADGE,
  type ChatBadgeContextType,
} from './chatBadgeContextDefinition';

export type { ChatBadgeContextType };

export const ChatBadgeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const response = await chatService.getChats({ page: 1, page_size: 50 });
      const total = (response.results || []).reduce(
        (sum, chat) => sum + (chat.unread_count || 0),
        0,
      );
      setUnreadCount(total);
    } catch {
      // Non-critical badge.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <ChatBadgeContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </ChatBadgeContext.Provider>
  );
};

export const useChatBadge = () => {
  return useContext(ChatBadgeContext) ?? EMPTY_CHAT_BADGE;
};
