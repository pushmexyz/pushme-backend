import express, { Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/env';
import { logger } from './utils/logger';
import authRoutes from './routes/auth';
import donateRoutes from './routes/donate';
import overlayRoutes from './routes/overlay';
import transactionRoutes from './routes/transaction';
import { createOverlaySocketServer } from './ws/overlaySocket';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging - only log important endpoints (not polling)
  app.use((req, res, next) => {
    // Skip logging for polling endpoints to reduce console spam
    if (req.path === '/overlay/recent' || req.path === '/overlay/health') {
      return next();
    }
    
    // Log important actions (donations, auth, transactions, etc.)
    if (req.path.startsWith('/donate') || req.path.startsWith('/auth') || req.path.startsWith('/transaction')) {
      logger.info(`${req.method} ${req.path}`);
    }
    
    next();
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/donate', donateRoutes);
  app.use('/overlay', overlayRoutes);
  app.use('/transaction', transactionRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'PushMe Backend',
      version: '1.0.0',
      status: 'running',
    });
  });

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}

export function startServer(): void {
  const app = createApp();
  const server = createServer(app);

  // Create WebSocket server
  createOverlaySocketServer(server);

  const port = config.port;

  server.listen(port, () => {
    logger.info(`🚀 PushMe Backend server running on port ${port}`);
    logger.info(`📡 WebSocket server available at ws://localhost:${port}/overlay`);
    logger.info(`🌐 REST API available at http://localhost:${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
}

