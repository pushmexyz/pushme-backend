import { OverlayEvent, DonationEventPayload } from '../types/OverlayEventTypes';
import { logger } from '../utils/logger';
import { ProcessedDonation } from '../types/DonationTypes';

// This will be set by the WebSocket server
let broadcastToOverlay: ((event: OverlayEvent) => void) | null = null;

export function setBroadcastFunction(fn: (event: OverlayEvent) => void) {
  broadcastToOverlay = fn;
}

export function emitToOverlay(event: OverlayEvent): void {
  if (!broadcastToOverlay) {
    // Only log warning if it's a critical event (donations, games, etc.)
    if (event.event === 'DONATION' || event.event === 'BUTTON_PRESS' || event.event === 'CHAOS_EFFECT') {
      logger.warn(`[OVERLAY] Broadcast function not set. Event not sent: ${event.event}`);
    }
    return;
  }

  try {
    broadcastToOverlay(event);
    // Only log important events (donations, games, actions)
    if (event.event === 'DONATION' || event.event === 'BUTTON_PRESS' || event.event === 'CHAOS_EFFECT') {
      logger.info(`[OVERLAY] Event broadcasted: ${event.event}`);
    }
  } catch (error) {
    logger.error('[OVERLAY] Error emitting event:', error);
  }
}

export function emitDonationEvent(donation: ProcessedDonation, donationId?: string, createdAt?: string): void {
  const payload: DonationEventPayload & { id?: string; created_at?: string } = {
    id: donationId,
    type: donation.type,
    media_url: donation.mediaUrl || undefined,
    text: donation.text || undefined,
    username: donation.username,
    wallet: donation.wallet,
    price: donation.price,
    tx_hash: donation.txHash,
    created_at: createdAt,
    timestamp: Date.now(),
  };

  emitToOverlay({
    event: 'DONATION',
    payload,
    timestamp: Date.now(),
  });
}

export function emitMediaEvent(url: string, type: string, username: string, duration?: number): void {
  emitToOverlay({
    event: 'MEDIA',
    payload: {
      url,
      type,
      username,
      duration,
    },
    timestamp: Date.now(),
  });
}

export function emitAlertEvent(message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
  emitToOverlay({
    event: 'ALERT',
    payload: {
      message,
      level,
    },
    timestamp: Date.now(),
  });
}

export function emitSystemMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
  emitToOverlay({
    event: 'SYSTEM_MESSAGE',
    payload: {
      message,
      type,
    },
    timestamp: Date.now(),
  });
}

export function emitWarning(message: string): void {
  emitToOverlay({
    event: 'WARNING',
    payload: { message },
    timestamp: Date.now(),
  });
}

export function emitFilterRejectedMedia(reason: string, username: string): void {
  emitToOverlay({
    event: 'FILTER_REJECTED_MEDIA',
    payload: {
      reason,
      username,
    },
    timestamp: Date.now(),
  });
}

export function emitStreamStatus(status: 'online' | 'offline'): void {
  emitToOverlay({
    event: 'STREAM_STATUS',
    payload: { status },
    timestamp: Date.now(),
  });
}

