import { AppState, AppStateStatus } from 'react-native';
import {
  REALTIME_MAX_RECONNECT_ATTEMPTS,
  REALTIME_RECONNECT_MAX_DELAY_MS,
  getChatWsUrl,
} from '../config/realtimeConfig';
import { websocketAuthService } from './websocketAuthService';

const getWebSocketUrl = async (chatId: number): Promise<string | null> => {
  try {
    return await websocketAuthService.getAuthorizedUrl(getChatWsUrl(chatId));
  } catch {
    return null;
  }
};

class WebSocketService {
  private ws: WebSocket | null = null;
  private chatId: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = REALTIME_MAX_RECONNECT_ATTEMPTS;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = false;
  private appState: AppStateStatus = AppState.currentState;
  private recentMessageIds: number[] = [];
  private appStateSubscription: { remove: () => void } | null = null;

  constructor() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    const wasBackground = this.appState !== 'active';
    this.appState = nextState;

    if (nextState === 'active') {
      this.shouldReconnect = true;
      if (wasBackground && this.chatId && !this.isConnected()) {
        this.connect(this.chatId);
      }
      return;
    }

    // Pause socket activity in background/inactive state.
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };

  async connect(chatId: number): Promise<void> {
    if (
      this.ws &&
      this.chatId === chatId &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.ws) {
      this.disconnect(false);
    }

    this.shouldReconnect = true;
    this.chatId = chatId;

    const url = await getWebSocketUrl(chatId);
    if (!url) {
      console.error('Unable to obtain WebSocket auth ticket');
      this.emit('error', { error: 'Unable to obtain WebSocket auth ticket' });
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connected', { chatId });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'pong') {
            this.clearPongTimeout();
            return;
          }

          if (data.type === 'new_message' && data.message?.id) {
            const messageId = data.message.id as number;
            if (this.recentMessageIds.includes(messageId)) {
              return;
            }
            this.recentMessageIds.push(messageId);
            if (this.recentMessageIds.length > 200) {
              this.recentMessageIds.shift();
            }
          }

          this.emit(data.type, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { error });
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.emit('disconnected', { chatId });
        if (
          this.shouldReconnect &&
          this.appState === 'active' &&
          this.chatId === chatId &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.reconnectAttempts++;
          const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts - 1),
            REALTIME_RECONNECT_MAX_DELAY_MS,
          );
          this.reconnectTimeout = setTimeout(() => {
            this.connect(chatId);
          }, delay);
        }
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      this.emit('error', { error });
    }
  }

  disconnect(clearSession: boolean = true): void {
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (clearSession) {
      this.shouldReconnect = false;
      this.chatId = null;
      this.reconnectAttempts = 0;
      this.recentMessageIds = [];
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  sendTyping(isTyping: boolean): void {
    this.send({
      type: 'typing',
      is_typing: isTyping,
    });
  }

  sendReadReceipt(messageId: number): void {
    this.send({
      type: 'read_receipt',
      message_id: messageId,
    });
  }

  on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.off(event, callback);
    };
  }

  off(event: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket listener for ${event}:`, error);
        }
      });
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.send(JSON.stringify({ type: 'ping' }));
      this.clearPongTimeout();
      this.pongTimeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
      }, 10000);
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

export const websocketService = new WebSocketService();
