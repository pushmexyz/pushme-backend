export type OverlayEventType =
  | 'DONATION'
  | 'BUTTON_PRESS'
  | 'MEDIA'
  | 'ALERT'
  | 'CHAOS_EFFECT'
  | 'SYSTEM_MESSAGE'
  | 'WARNING'
  | 'FILTER_REJECTED_MEDIA'
  | 'STREAM_STATUS';

export interface OverlayEvent {
  event: OverlayEventType;
  payload: any;
  timestamp: number;
}

export interface DonationEventPayload {
  id?: string;
  type: 'text' | 'gif' | 'image' | 'audio' | 'video';
  media_url?: string;
  text?: string;
  username: string;
  wallet: string;
  price: number;
  tx_hash?: string;
  created_at?: string;
  timestamp: number;
}

export interface MediaEventPayload {
  url: string;
  type: string;
  username: string;
  duration?: number;
}

export interface AlertEventPayload {
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

export interface SystemMessagePayload {
  message: string;
  type: 'info' | 'warning' | 'error';
}

