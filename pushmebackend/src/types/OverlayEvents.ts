/**
 * Unified overlay event types
 */

export interface OverlayDonationEvent {
  type: 'donation';
  wallet: string;
  username: string;
  amount: number;
  message: string | null;
  mediaUrl: string | null;
  mediaType: 'text' | 'image' | 'gif' | 'audio' | 'video';
  txHash: string;
  timestamp: number;
}

export interface OverlayNowPlayingEvent {
  type: 'now_playing';
  title: string;
  artist: string;
  image?: string;
  timestamp: number;
}

export type OverlayEvent = OverlayDonationEvent | OverlayNowPlayingEvent;

