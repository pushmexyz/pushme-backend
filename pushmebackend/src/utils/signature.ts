import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { logger } from './logger';
import bs58 from 'bs58';

// Nonce storage with key format: nonce:{wallet}:{nonce}
const nonceStore = new Map<string, { wallet: string; timestamp: number }>();

const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (now - value.timestamp > NONCE_EXPIRY_MS) {
      nonceStore.delete(key);
      logger.debug(`Cleaned up expired nonce: ${key}`);
    }
  }
}, 60000); // Run cleanup every minute

export function generateNonce(wallet: string): { nonce: string; timestamp: number; message: string } {
  // Generate random nonce
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now();
  
  // Exact message format for Phantom compatibility
  const message = `Sign this message to authenticate with PushMe.\n\nWallet: ${wallet}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

  // Store nonce with key format: nonce:{wallet}:{nonce}
  const nonceKey = `nonce:${wallet}:${nonce}`;
  nonceStore.set(nonceKey, { wallet, timestamp });

  logger.info(`[SIGNATURE] Nonce generated: ${nonceKey}`);

  return { nonce, timestamp, message };
}

export function verifyNonce(wallet: string, nonce: string, timestamp: number): boolean {
  const nonceKey = `nonce:${wallet}:${nonce}`;
  const stored = nonceStore.get(nonceKey);

  if (!stored) {
    logger.warn(`[SIGNATURE] No nonce found for key: ${nonceKey}`);
    return false;
  }

  if (stored.wallet !== wallet) {
    logger.warn(`[SIGNATURE] Wallet mismatch for nonce: ${nonceKey}`);
    return false;
  }

  if (stored.timestamp !== timestamp) {
    logger.warn(`[SIGNATURE] Timestamp mismatch for nonce: ${nonceKey}`);
    return false;
  }

  // Check expiration
  if (Date.now() - timestamp > NONCE_EXPIRY_MS) {
    logger.warn(`[SIGNATURE] Nonce expired: ${nonceKey}`);
    nonceStore.delete(nonceKey);
    return false;
  }

  return true;
}

export function deleteNonce(wallet: string, nonce: string): void {
  const nonceKey = `nonce:${wallet}:${nonce}`;
  nonceStore.delete(nonceKey);
  logger.debug(`[SIGNATURE] Deleted nonce: ${nonceKey}`);
}

export function verifySignature(
  wallet: string,
  signature: string,
  nonce: string,
  timestamp: number
): boolean {
  try {
    // 1. Verify nonce exists and hasn't expired
    if (!verifyNonce(wallet, nonce, timestamp)) {
      return false;
    }

    // 2. Reconstruct the exact message (must match exactly)
    const message = `Sign this message to authenticate with PushMe.\n\nWallet: ${wallet}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);

    // 3. Convert signature from hex or base58 to Uint8Array
    let signatureBytes: Uint8Array;
    try {
      // Try hex first (Phantom typically returns hex)
      if (signature.length === 128 || (signature.length === 130 && signature.startsWith('0x'))) {
        const hexString = signature.startsWith('0x') ? signature.slice(2) : signature;
        signatureBytes = Uint8Array.from(Buffer.from(hexString, 'hex'));
      } else {
        // Try base58 (Solana standard)
        signatureBytes = bs58.decode(signature);
      }
    } catch (error) {
      logger.error(`[SIGNATURE] Invalid signature format: ${signature}`, error);
      return false;
    }

    // 4. Convert wallet address to public key bytes
    let publicKeyBytes: Uint8Array;
    try {
      const publicKey = new PublicKey(wallet);
      publicKeyBytes = publicKey.toBytes();
    } catch (error) {
      logger.error(`[SIGNATURE] Invalid wallet address: ${wallet}`, error);
      return false;
    }

    // 5. Verify signature using Ed25519 (nacl)
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    if (isValid) {
      // 6. Delete used nonce after successful verification
      deleteNonce(wallet, nonce);
      logger.info(`[SIGNATURE] Signature verified successfully for wallet: ${wallet}`);
    } else {
      logger.warn(`[SIGNATURE] Signature verification failed for wallet: ${wallet}`);
    }

    return isValid;
  } catch (error) {
    logger.error('[SIGNATURE] Error verifying signature:', error);
    return false;
  }
}

