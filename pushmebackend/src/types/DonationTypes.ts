export type DonationType = 'text' | 'gif' | 'image' | 'audio' | 'video';

export interface DonationMetadata {
  duration?: number;
  size?: number;
  filetype?: string;
  width?: number;
  height?: number;
}

export interface DonationPayload {
  type: DonationType;
  content: string; // base64, URL, or text
  username: string;
  wallet: string;
  txHash: string;
  metadata?: DonationMetadata;
}

export interface ProcessedDonation {
  type: DonationType;
  text: string | null;
  mediaUrl: string | null;
  username: string;
  wallet: string;
  txHash: string;
  price: number;
  metadata?: DonationMetadata;
}

export const DONATION_PRICES: Record<DonationType, number> = {
  text: 0.01,
  gif: 0.02,
  image: 0.03,
  audio: 0.05,
  video: 0.1,
};

