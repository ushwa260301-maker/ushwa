import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server;

export const initializeSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join user to their personal room
    socket.on('join', (userId: string) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`[Socket] User ${userId} joined room user:${userId}`);
      }
    });

    // Leave user room
    socket.on('leave', (userId: string) => {
      if (userId) {
        socket.leave(`user:${userId}`);
        console.log(`[Socket] User ${userId} left room user:${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket] Socket.io initialized');

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initializeSocket first.');
  }
  return io;
};

export const emitToUser = (userId: string, event: string, data: unknown): void => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};
