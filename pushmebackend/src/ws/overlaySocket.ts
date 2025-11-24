import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/env';
import { OverlayEvent } from '../types/OverlayEvents';

interface AuthenticatedWebSocket extends WebSocket {
  isAuthenticated?: boolean;
  overlayKey?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const overlayClients = new Set<WebSocket>();

export function createOverlaySocketServer(server: any): WebSocketServer {
  wss = new WebSocketServer({
    server,
    path: '/overlay',
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle authentication
        if (data.type === 'auth') {
          const { key } = data;

          if (key === config.overlay.secret) {
            ws.isAuthenticated = true;
            ws.overlayKey = key;
            overlayClients.add(ws);
            console.info('[OVERLAY] WebSocket client authenticated');

            ws.send(
              JSON.stringify({
                type: 'auth_success',
                message: 'Authenticated successfully',
              })
            );
          } else {
            console.warn('[OVERLAY] Invalid authentication key attempted');
            ws.send(
              JSON.stringify({
                type: 'auth_failed',
                message: 'Invalid authentication key',
              })
            );
            ws.close();
          }
          return;
        }

        // Only process messages from authenticated clients
        if (!ws.isAuthenticated) {
          console.warn('[OVERLAY] Message from unauthenticated client');
          ws.close();
          return;
        }
      } catch (error) {
        console.error('[OVERLAY] Error processing message:', error);
      }
    });

    ws.on('close', () => {
      overlayClients.delete(ws);
      if (ws.isAuthenticated) {
        console.info('[OVERLAY] WebSocket client disconnected');
      }
    });

    ws.on('error', (error) => {
      console.error('[OVERLAY] WebSocket error:', error);
      overlayClients.delete(ws);
    });

    // Ping/pong to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        overlayClients.delete(ws);
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
      overlayClients.delete(ws);
    });
  });

  console.info('[OVERLAY] WebSocket server created on /overlay');
  return wss;
}

/**
 * Unified broadcast function for all overlay events
 * Always uses JSON.stringify() and checks client.readyState === OPEN
 */
export function broadcastOverlayEvent(event: OverlayEvent): void {
  if (!wss) {
    console.warn('[OVERLAY] WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify(event);
  let sentCount = 0;
  const deadClients: WebSocket[] = [];

  overlayClients.forEach((client) => {
    // Check if client is open before sending
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sentCount++;
      } catch (error) {
        console.error('[OVERLAY] Error sending message:', error);
        deadClients.push(client);
      }
    } else {
      // Client is not open, mark for removal
      deadClients.push(client);
    }
  });

  // Remove dead clients
  deadClients.forEach((client) => {
    overlayClients.delete(client);
  });

  if (sentCount > 0) {
    console.info(`[OVERLAY] Broadcasting ${event.type} to ${sentCount} client(s)`);
  }
}

/**
 * Broadcast auth event (legacy support)
 */
export function broadcastAuthEvent(user: {
  username: string | null;
  wallet: string;
}): void {
  // Auth events are handled separately if needed
  // This function kept for backward compatibility
}

/**
 * Broadcast donation event (uses unified broadcastOverlayEvent)
 */
export function broadcastDonationEvent(payload: {
  type: 'donation';
  wallet: string;
  username: string;
  amount: number;
  message: string | null;
  mediaUrl: string | null;
  mediaType: 'text' | 'image' | 'gif' | 'audio' | 'video';
  txHash: string;
  timestamp: number;
}): void {
  broadcastOverlayEvent(payload);
}

export function getConnectedClientsCount(): number {
  return overlayClients.size;
}

export function closeOverlaySocketServer(): void {
  if (wss) {
    overlayClients.forEach((client) => {
      client.close();
    });
    overlayClients.clear();
    wss.close();
    wss = null;
    console.info('[OVERLAY] WebSocket server closed');
  }
}

