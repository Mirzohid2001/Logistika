const appStateListeners: Array<(state: string) => void> = [];

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock('../services/secureTokenStorage', () => ({
  secureTokenStorage: { hasTokens: jest.fn(async () => true) },
}));

jest.mock('../services/websocketAuthService', () => ({
  websocketAuthService: { getAuthorizedUrl: jest.fn(async (url: string) => `${url}?ticket=test`) },
}));

import { realtimeChannelService } from '../services/realtimeChannelService';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = jest.fn();

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) {return;}
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('realtimeChannelService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    appStateListeners.length = 0;
    (global as any).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delivers websocket payloads and resyncs once connected', async () => {
    const onMessage = jest.fn();
    const onPoll = jest.fn(async () => undefined);
    const onConnected = jest.fn();
    const channel = realtimeChannelService.createChannel({
      wsUrl: 'ws://tracking/1',
      onMessage,
      onPoll,
      onConnected,
    });
    await flushPromises();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.onmessage?.({ data: JSON.stringify({ type: 'location_update', lat: 41, lng: 69 }) });
    await flushPromises();

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(onPoll).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: 'location_update', lat: 41, lng: 69 });
    channel.stop();
  });

  it('never overlaps fallback polling requests', async () => {
    let finishPoll!: () => void;
    const pendingPoll = new Promise<void>((resolve) => {
      finishPoll = resolve;
    });
    const onPoll = jest.fn(() => pendingPoll);
    const channel = realtimeChannelService.createChannel({
      wsUrl: 'ws://tracking/2',
      onMessage: jest.fn(),
      onPoll,
      pollIntervalMs: 1000,
    });
    await flushPromises();

    jest.advanceTimersByTime(4000);
    expect(onPoll).toHaveBeenCalledTimes(1);

    finishPoll();
    await flushPromises();
    jest.advanceTimersByTime(1000);
    expect(onPoll).toHaveBeenCalledTimes(2);
    channel.stop();
  });

  it('resumes heartbeat when an open socket returns to foreground', async () => {
    const channel = realtimeChannelService.createChannel({
      wsUrl: 'ws://tracking/3',
      onMessage: jest.fn(),
      heartbeatIntervalMs: 1000,
    });
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    appStateListeners[0]('background');
    jest.advanceTimersByTime(2000);
    expect(socket.send).not.toHaveBeenCalled();

    appStateListeners[0]('active');
    jest.advanceTimersByTime(1000);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    channel.stop();
  });
});
