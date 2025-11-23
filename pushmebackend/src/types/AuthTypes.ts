export interface NonceResponse {
  nonce: string;
  timestamp: number;
  message: string;
}

export interface VerifyPayload {
  wallet: string;
  signature: string;
  nonce: string;
  timestamp: number;
}

export interface AuthToken {
  wallet: string;
  iat: number;
  exp: number;
}

export interface AuthRequest {
  wallet: string;
  signature: string;
}

