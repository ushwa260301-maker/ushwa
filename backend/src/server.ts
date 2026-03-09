import { createServer } from 'http';
import app from './app';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { initializeSocket } from './config/socket';

const httpServer = createServer(app);

// Initialize Socket.io
initializeSocket(httpServer);

const start = async () => {
  await connectDatabase();
  httpServer.listen(config.port, () => {
    console.log(`🌸 어서화 서버가 포트 ${config.port}에서 실행 중입니다`);
    console.log(`📡 환경: ${config.nodeEnv}`);
  });
};

start().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
