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
  private connectInFlight = false;
  private readonly options: Required<RealtimeChannelOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollInFlight = false;
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
    void this.connect();
    this.startPolling();
  }

  private onAppStateChange = (nextState: AppStateStatus) => {
    this.appState = nextState;
    if (nextState === 'active') {
      this.reconnectAttempts = 0;
      void this.runPoll(true);
      if (this.isConnected()) {
        this.startHeartbeat();
      } else if (this.shouldRun) {
        void this.connect();
      }
      if (!this.pollInterval) {
        this.startPolling();
      }
      return;
    }
    this.stopHeartbeat();
  };

  private async connect() {
    if (!this.shouldRun || this.appState !== 'active') {return;}
    if (this.connectInFlight) {return;}
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.connectInFlight = true;
    try {
      const hasTokens = await secureTokenStorage.hasTokens();
      if (!hasTokens) {return;}

      const wsUrl = await websocketAuthService.getAuthorizedUrl(this.options.wsUrl);
      if (!this.shouldRun || this.appState !== 'active') {return;}
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket || !this.shouldRun) {
          socket.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.options.onConnected();
        // Fill the possible gap between the last poll and WebSocket handshake.
        void this.runPoll(true);
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket || !this.shouldRun) {return;}
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

      socket.onerror = () => {
        if (this.ws === socket && socket.readyState < WebSocket.CLOSING) {
          socket.close();
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) {return;}
        this.ws = null;
        this.stopHeartbeat();
        this.options.onDisconnected();
        void this.runPoll(true);
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connectInFlight = false;
    }
  }

  private scheduleReconnect() {
    if (!this.shouldRun || this.appState !== 'active') {return;}
    if (this.reconnectTimer) {return;}

    this.reconnectAttempts += 1;
    // Keep retrying forever at the capped delay. A temporary outage must not
    // permanently disable live tracking until the app is restarted.
    const exponent = Math.max(
      0,
      Math.min(this.reconnectAttempts, Math.max(1, this.options.maxReconnectAttempts)) - 1,
    );
    const delayMs = Math.min(1000 * Math.pow(2, exponent), REALTIME_RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {return;}
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
    if (this.pollInterval) {return;}
    this.pollInterval = setInterval(() => {
      void this.runPoll();
    }, this.options.pollIntervalMs);
  }

  private async runPoll(force = false) {
    if (!this.shouldRun || this.pollInFlight) {return;}
    if (this.appState !== 'active' && !this.options.pollInBackground) {return;}
    if (!force && this.isConnected()) {return;}
    this.pollInFlight = true;
    try {
      await this.options.onPoll();
    } catch (error) {
      console.error('Realtime polling error:', error);
    } finally {
      this.pollInFlight = false;
    }
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
      const socket = this.ws;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
  }
}

export const realtimeChannelService = {
  createChannel(options: RealtimeChannelOptions): RealtimeChannelHandle {
    return new ManagedRealtimeChannel(options);
  },
};
