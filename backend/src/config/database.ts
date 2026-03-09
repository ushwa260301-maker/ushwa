import mongoose from 'mongoose';
import { config } from './env';

export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] Connected successfully');
    });

    mongoose.connection.on('error', (err: Error) => {
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('[MongoDB] Connection closed due to application termination');
      process.exit(0);
    });

    await mongoose.connect(config.mongodbUri, {
      autoIndex: config.nodeEnv !== 'production',
    });
  } catch (error) {
    console.error('[MongoDB] Initial connection failed:', error);
    process.exit(1);
  }
};
