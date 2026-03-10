import { io, Socket } from 'socket.io-client';

const SOCKET_URL = (() => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
  // Strip /api suffix to get the socket server base URL
  return apiUrl.replace(/\/api\/?$/, '');
})();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(userId: string): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  s.emit('join', userId);
}

export function disconnectSocket(userId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('leave', userId);
    s.disconnect();
  }
}
