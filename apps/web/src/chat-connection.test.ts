import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleChatConnection } from './chat-connection.js';

class TestSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = TestSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = TestSocket.CLOSED;
  });
  open() {
    this.readyState = TestSocket.OPEN;
    this.onopen?.();
    this.dispatchEvent(new Event('open'));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  vi.useFakeTimers();
  const sockets: TestSocket[] = [];
  class Socket extends TestSocket {
    constructor(public url: string) {
      super();
      sockets.push(this);
    }
  }
  vi.stubGlobal('WebSocket', Socket);
  return sockets;
}

describe('chat connection lifecycle', () => {
  it('starts only one handshake during Strict Mode setup/cleanup/setup', () => {
    const sockets = setup();
    const connected = vi.fn();
    const cancel = scheduleChatConnection('ws://localhost/chat', connected);
    cancel();
    const disconnect = scheduleChatConnection('ws://localhost/chat', connected);
    vi.runAllTimers();
    expect(sockets).toHaveLength(1);
    expect(connected).toHaveBeenCalledExactlyOnceWith(sockets[0]);
    sockets[0]!.open();
    disconnect();
    expect(sockets[0]!.close).toHaveBeenCalledOnce();
  });

  it('finishes a pending handshake before closing and detaches stale callbacks', () => {
    const sockets = setup();
    const callback = vi.fn();
    const disconnect = scheduleChatConnection(
      'ws://localhost/chat',
      (socket) => {
        socket.onopen = callback;
        socket.onclose = callback;
        socket.onerror = callback;
        socket.onmessage = callback;
      },
    );
    vi.runAllTimers();
    const socket = sockets[0]!;
    disconnect();
    expect(socket.close).not.toHaveBeenCalled();
    expect([
      socket.onopen,
      socket.onclose,
      socket.onerror,
      socket.onmessage,
    ]).toEqual([null, null, null, null]);
    socket.open();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not close a socket again after a connection failure', () => {
    const sockets = setup();
    const disconnect = scheduleChatConnection('ws://localhost/chat', () => {});
    vi.runAllTimers();
    sockets[0]!.readyState = TestSocket.CLOSED;
    disconnect();
    expect(sockets[0]!.close).not.toHaveBeenCalled();
  });
});
