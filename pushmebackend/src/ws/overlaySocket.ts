import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { setBroadcastFunction } from '../services/overlayEventService';
import { OverlayEvent, DonationEventPayload } from '../types/OverlayEventTypes';
import { DonationType } from '../types/DonationTypes';

interface AuthenticatedWebSocket extends WebSocket {
  isAuthenticated?: boolean;
  overlayKey?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const connectedClients = new Set<AuthenticatedWebSocket>();

export function createOverlaySocketServer(server: any): WebSocketServer {
  wss = new WebSocketServer({
    server,
    path: '/overlay',
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    // Reduced logging - only log authentication

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle authentication
        if (data.type === 'auth') {
          const { key } = data;

          if (key === config.overlay.secret) {
            ws.isAuthenticated = true;
            ws.overlayKey = key;
            connectedClients.add(ws);
            logger.info('[OVERLAY] ✅ WebSocket client connected and authenticated');

            ws.send(
              JSON.stringify({
                event: 'AUTH_SUCCESS',
                payload: { message: 'Authenticated successfully' },
                timestamp: Date.now(),
              })
            );
          } else {
            logger.warn('Invalid overlay key attempted');
            ws.send(
              JSON.stringify({
                event: 'AUTH_FAILED',
                payload: { message: 'Invalid authentication key' },
                timestamp: Date.now(),
              })
            );
            ws.close();
          }
          return;
        }

        // Only process messages from authenticated clients
        if (!ws.isAuthenticated) {
          logger.warn('Message received from unauthenticated client');
          ws.close();
          return;
        }

        // Handle other message types if needed
        logger.debug('Message from overlay:', data);
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      if (ws.isAuthenticated) {
        connectedClients.delete(ws);
        logger.info('[OVERLAY] WebSocket client disconnected');
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      if (ws.isAuthenticated) {
        connectedClients.delete(ws);
      }
    });

    // Send ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        if (ws.isAuthenticated) {
          connectedClients.delete(ws);
        }
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // Set up broadcast function for overlay event service
  setBroadcastFunction((event: OverlayEvent) => {
    broadcastToOverlay(event);
  });

  logger.info('WebSocket server created on /overlay');
  return wss;
}

function broadcastToOverlay(event: OverlayEvent): void {
  if (!wss) {
    logger.warn('[OVERLAY] WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify(event);
  let sentCount = 0;

  connectedClients.forEach((client) => {
    if (client.isAuthenticated && client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sentCount++;
      } catch (error) {
        logger.error('[OVERLAY] Error sending message to overlay client:', error);
        connectedClients.delete(client);
      }
    }
  });

  // Only log if event was sent (reduces noise)
  if (sentCount > 0 && (event.event === 'DONATION' || event.event === 'BUTTON_PRESS' || event.event === 'CHAOS_EFFECT')) {
    logger.info(`[OVERLAY] 📡 Broadcasted ${event.event} to ${sentCount} client(s)`);
  }
}

/**
 * Broadcasts a donation event directly to all connected overlay clients
 * This triggers immediate animation of the red button on the overlay
 */
export function broadcastDonation(params: {
  type: DonationType;
  wallet: string;
  content?: string;
  amount: number;
  signature: string;
  username?: string;
  donationId?: string;
  createdAt?: string;
}): void {
  const payload: DonationEventPayload = {
    id: params.donationId,
    type: params.type,
    media_url: params.type !== 'text' ? params.content || undefined : undefined,
    text: params.type === 'text' ? params.content || undefined : undefined,
    username: params.username || params.wallet,
    wallet: params.wallet,
    price: params.amount,
    tx_hash: params.signature,
    created_at: params.createdAt,
    timestamp: Date.now(),
  };

  const event: OverlayEvent = {
    event: 'DONATION',
    payload,
    timestamp: Date.now(),
  };

  broadcastToOverlay(event);
  logger.info(`[OVERLAY] 🎉 Donation broadcasted: ${params.type} from ${params.username || params.wallet} (${params.amount} SOL)`);
}

export function getConnectedClientsCount(): number {
  return connectedClients.size;
}

export function closeOverlaySocketServer(): void {
  if (wss) {
    connectedClients.forEach((client) => {
      client.close();
    });
    connectedClients.clear();
    wss.close();
    wss = null;
    logger.info('WebSocket server closed');
  }
}

