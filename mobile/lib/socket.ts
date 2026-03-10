import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5001';

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
