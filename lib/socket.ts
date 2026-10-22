import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

// Callbacks to invoke whenever the socket successfully reconnects
const reconnectCallbacks: Array<() => void> = [];

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Register a callback that fires every time the socket reconnects.
 * Returns an unsubscribe function.
 */
export function onSocketReconnect(cb: () => void): () => void {
  reconnectCallbacks.push(cb);
  return () => {
    const idx = reconnectCallbacks.indexOf(cb);
    if (idx !== -1) reconnectCallbacks.splice(idx, 1);
  };
}

export function connectSocket(): Socket {
  const { accessToken } = useAuthStore.getState();

  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(BASE_URL, {
    auth: {
      token: accessToken ? `Bearer ${accessToken}` : '',
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    // Start reconnecting after 1 s; back off up to 5 s so we don't hammer
    // the server on a flaky connection, but still recover reasonably quickly.
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('⚡ Socket.IO connected with id:', socket?.id);
  });

  // 'reconnect' fires on the socket object in Socket.IO v4 each time the
  // underlying manager successfully re-establishes the connection.
  socket.on('reconnect', (attempt: number) => {
    console.log(`⚡ Socket.IO reconnected after ${attempt} attempt(s)`);
    for (const cb of reconnectCallbacks) {
      try { cb(); } catch (e) { console.warn('reconnect callback error:', e); }
    }
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket connect error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function updateSocketToken(token: string) {
  if (socket) {
    socket.auth = {
      token: token ? `Bearer ${token}` : '',
    };
    if (!socket.connected) {
      socket.connect();
    }
  }
}

export function emitTypingStart(conversationId: string) {
  socket?.emit('typing:start', { conversationId });
}

export function emitTypingStop(conversationId: string) {
  socket?.emit('typing:stop', { conversationId });
}

export function emitJoinConversation(conversationId: string) {
  socket?.emit('conversation:join', conversationId);
}

export function emitConversationViewing(conversationId: string) {
  socket?.emit('conversation:viewing', conversationId);
}

export function emitConversationLeaveViewing(conversationId: string) {
  socket?.emit('conversation:leave_viewing', conversationId);
}
