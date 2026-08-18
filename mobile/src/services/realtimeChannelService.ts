import { AppState, AppStateStatus } from 'react-native';
import {
  REALTIME_MAX_RECONNECT_ATTEMPTS,
  REALTIME_RECONNECT_MAX_DELAY_MS,
} from '../config/realtimeConfig';
import { secureTokenStorage } from './secureTokenStorage';
import { websocketAuthService } from './websocketAuthService';

type RealtimeMessageHandler = (payload: any) => void;
type RealtimePollHandler = () => void | Promise<void>;

export interface RealtimeChannelOptions {
  wsUrl: string;
  onMessage: RealtimeMessageHandler;
  onPoll?: RealtimePollHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
  pollIntervalMs?: number;
  pollInBackground?: boolean;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
}

export interface RealtimeChannelHandle {
  stop: () => void;
  send: (payload: any) => void;
  isConnected: () => boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10000;

class ManagedRealtimeChannel implements RealtimeChannelHandle {
  private ws: WebSocket | null = null;
  private readonly options: Required<RealtimeChannelOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private shouldRun = true;
  private appStateSub: { remove: () => void } | null = null;

  constructor(options: RealtimeChannelOptions) {
    this.options = {
      ...options,
      onPoll: options.onPoll ?? (() => undefined),
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      pollInBackground: options.pollInBackground ?? false,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      maxReconnectAttempts: options.maxReconnectAttempts ?? REALTIME_MAX_RECONNECT_ATTEMPTS,
      onConnected: options.onConnected ?? (() => undefined),
      onDisconnected: options.onDisconnected ?? (() => undefined),
    };
    this.appStateSub = AppState.addEventListener('change', this.onAppStateChange);
    this.connect();
    this.startPolling();
  }

  private onAppStateChange = (nextState: AppStateStatus) => {
    this.appState = nextState;
    if (nextState === 'active') {
      if (!this.isConnected() && this.shouldRun) {
        this.connect();
      }
      if (!this.pollInterval) {
        this.startPolling();
      }
      return;
    }
    this.stopHeartbeat();
  };

  private async connect() {
    if (!this.shouldRun || this.appState !== 'active') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const hasTokens = await secureTokenStorage.hasTokens();
      if (!hasTokens) return;

      const wsUrl = await websocketAuthService.getAuthorizedUrl(this.options.wsUrl);
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.options.onConnected();
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'pong') {
          this.clearHeartbeatTimeout();
          return;
        }
        this.options.onMessage(payload);
      } catch (error) {
        console.error('Realtime WS parse error:', error);
      }
    };

    this.ws.onerror = () => {
      this.scheduleReconnect();
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.options.onDisconnected();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.shouldRun || this.appState !== 'active') return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), REALTIME_RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: 'ping' }));
      this.clearHeartbeatTimeout();
      this.heartbeatTimeout = setTimeout(() => {
        this.ws?.close();
      }, this.options.heartbeatTimeoutMs);
    }, this.options.heartbeatIntervalMs);
  }

  private clearHeartbeatTimeout() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatTimeout();
  }

  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (!this.shouldRun) return;
      if (this.appState !== 'active' && !this.options.pollInBackground) return;
      if (this.isConnected()) return;
      this.options.onPoll();
    }, this.options.pollIntervalMs);
  }

  send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  stop() {
    this.shouldRun = false;
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const realtimeChannelService = {
  createChannel(options: RealtimeChannelOptions): RealtimeChannelHandle {
    return new ManagedRealtimeChannel(options);
  },
};
