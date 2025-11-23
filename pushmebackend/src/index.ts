import { startServer } from './server';
import { logger } from './utils/logger';

// Initialize and start the server
try {
  logger.info('Starting PushMe Backend...');
  startServer();
} catch (error) {
  logger.error('Failed to start server:', error);
  process.exit(1);
}

