import express, { Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/env';
import authRoutes from './routes/auth';
import donationRoutes from './routes/donation';
import musicRoutes from './routes/music';
import { createOverlaySocketServer } from './ws/overlaySocket';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Routes
  app.use('/auth', authRoutes);
  app.use('/donation', donationRoutes);
  app.use('/music', musicRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'PushMe Backend',
      version: '1.0.0',
      status: 'running',
    });
  });

  // 404 handler - return JSON instead of HTML
  app.use((req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path,
    });
  });

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[SERVER] Unhandled error:', err);
    res.status(500).json({
      success: false,
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
    console.info(`🚀 PushMe Backend server running on port ${port}`);
    console.info(`📡 WebSocket server available at ws://localhost:${port}/overlay`);
    console.info(`🌐 REST API available at http://localhost:${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.info('[SERVER] SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.info('[SERVER] HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.info('[SERVER] SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.info('[SERVER] HTTP server closed');
      process.exit(0);
    });
  });
}

