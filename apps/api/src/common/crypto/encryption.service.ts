import crypto from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const VAULT_ENCRYPTION_MAGIC_PREFIX = Buffer.from('SSENC01', 'ascii'); // 7 bytes
export const GCM_NONCE_LENGTH_BYTES = 12; // 96 bits NIST recommendation
export const GCM_AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
export const VAULT_HEADER_LENGTH_BYTES =
  VAULT_ENCRYPTION_MAGIC_PREFIX.length +
  GCM_NONCE_LENGTH_BYTES +
  GCM_AUTH_TAG_LENGTH_BYTES; // 35 bytes

export class CorruptedVaultDataException extends Error {
  constructor(message = 'Cryptographic authentication failed: stored data is corrupted or tampered with.') {
    super(message);
    this.name = 'CorruptedVaultDataException';
  }
}

export class EncryptionConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionConfigurationException';
  }
}

export interface EncryptedTokenEnvelope {
  evidenceId: string;
  userId: string;
  jti: string;
  exp: number;
  purpose: 'EVIDENCE_DOWNLOAD';
}

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.key = this.loadAndValidateKey();
  }

  /**
   * Securely loads and validates the 32-byte (256-bit) encryption key from environment configuration.
   * Hardcoded keys are strictly prohibited.
   */
  private loadAndValidateKey(): Buffer {
    const rawKey =
      this.configService.get<string>('app.evidenceEncryptionKey') ??
      process.env.EVIDENCE_ENCRYPTION_KEY ??
      process.env.ENCRYPTION_KEY;

    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      throw new EncryptionConfigurationException(
        'EVIDENCE_ENCRYPTION_KEY environment variable is required and must not be empty. Encryption keys must never be hardcoded.',
      );
    }

    const trimmed = rawKey.trim();
    let keyBuffer: Buffer;

    // Check 64-hex format (32 bytes = 256 bits)
    if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
      keyBuffer = Buffer.from(trimmed, 'hex');
    }
    // Check 44-char base64 format (32 bytes = 256 bits)
    else if (trimmed.length === 44 && /^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
      keyBuffer = Buffer.from(trimmed, 'base64');
    } else {
      throw new EncryptionConfigurationException(
        `EVIDENCE_ENCRYPTION_KEY must be exactly 32 bytes (256 bits). Provide a 64-character hex string or 44-character base64 string. Received invalid key format (${trimmed.length} characters). Encryption keys must never be hardcoded.`,
      );
    }

    if (keyBuffer.length !== 32) {
      throw new EncryptionConfigurationException(
        `EVIDENCE_ENCRYPTION_KEY resolved to ${keyBuffer.length} bytes, but AES-256 requires exactly 32 bytes (256 bits).`,
      );
    }

    return keyBuffer;
  }

  /**
   * Returns whether a given buffer begins with the SafeSignal Vault Encryption header.
   */
  isVaultEncrypted(buffer: Buffer): boolean {
    if (!buffer || buffer.length < VAULT_HEADER_LENGTH_BYTES) {
      return false;
    }
    return (
      buffer
        .subarray(0, VAULT_ENCRYPTION_MAGIC_PREFIX.length)
        .equals(VAULT_ENCRYPTION_MAGIC_PREFIX)
    );
  }

  /**
   * Encrypts binary data using AES-256-GCM.
   * Generates a unique 96-bit cryptographically secure random nonce for every operation.
   * Appends a 128-bit authentication tag to ensure authenticated decryption.
   *
   * Envelope format:
   * [MAGIC (7B: SSENC01)][NONCE (12B)][AUTH_TAG (16B)][CIPHERTEXT (NB)]
   */
  encryptBuffer(plaintext: Buffer): Buffer {
    if (!Buffer.isBuffer(plaintext)) {
      throw new InternalServerErrorException({
        code: 'ENCRYPTION_ERROR',
        message: 'Invalid plaintext data provided for encryption.',
      });
    }

    // Unique nonce / IV per NIST SP 800-38D (12 bytes)
    const nonce = crypto.randomBytes(GCM_NONCE_LENGTH_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag(); // 16 bytes GCM auth tag

    return Buffer.concat([
      VAULT_ENCRYPTION_MAGIC_PREFIX,
      nonce,
      authTag,
      ciphertext,
    ]);
  }

  /**
   * Authenticates and decrypts an AES-256-GCM encrypted envelope.
   * Verifies the authentication tag before returning any decrypted plaintext.
   * If corrupted, altered, or tampered with, throws CorruptedVaultDataException.
   *
   * If the buffer does not begin with SSENC01, it is treated as unencrypted legacy data.
   */
  decryptBuffer(encryptedBuffer: Buffer): Buffer {
    if (!Buffer.isBuffer(encryptedBuffer)) {
      throw new CorruptedVaultDataException('Invalid buffer format provided for decryption.');
    }

    // If unencrypted legacy buffer, pass through
    if (!this.isVaultEncrypted(encryptedBuffer)) {
      return encryptedBuffer;
    }

    const nonceOffset = VAULT_ENCRYPTION_MAGIC_PREFIX.length;
    const tagOffset = nonceOffset + GCM_NONCE_LENGTH_BYTES;
    const ciphertextOffset = tagOffset + GCM_AUTH_TAG_LENGTH_BYTES;

    const nonce = encryptedBuffer.subarray(nonceOffset, tagOffset);
    const authTag = encryptedBuffer.subarray(tagOffset, ciphertextOffset);
    const ciphertext = encryptedBuffer.subarray(ciphertextOffset);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return plaintext;
    } catch {
      throw new CorruptedVaultDataException(
        'Evidence file failed cryptographic authentication: data is corrupted or tampered with.',
      );
    }
  }

  /**
   * Issues a short-lived, single-purpose download authorization token.
   * Encrypted using AES-256-GCM with a unique nonce and authenticated tag.
   * Token is url-safe base64 encoded.
   */
  encryptDownloadToken(payload: EncryptedTokenEnvelope): string {
    const jsonStr = JSON.stringify(payload);
    const nonce = crypto.randomBytes(GCM_NONCE_LENGTH_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce);

    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(jsonStr, 'utf-8')),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Packed token: [NONCE (12B)][AUTH_TAG (16B)][CIPHERTEXT]
    const packed = Buffer.concat([nonce, authTag, ciphertext]);
    return packed.toString('base64url');
  }

  /**
   * Decrypts and verifies a short-lived download authorization token.
   * Throws UnauthorizedException if tampered, forged, corrupted, or invalid.
   */
  decryptDownloadToken(tokenString: string): EncryptedTokenEnvelope {
    if (!tokenString || typeof tokenString !== 'string') {
      throw new UnauthorizedException({
        code: 'INVALID_DOWNLOAD_TOKEN',
        message: 'Download authorization token is missing or invalid.',
      });
    }

    try {
      const packed = Buffer.from(tokenString, 'base64url');
      const minLen = GCM_NONCE_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES + 2; // at least 30 bytes
      if (packed.length < minLen) {
        throw new Error('Token length too short');
      }

      const nonce = packed.subarray(0, GCM_NONCE_LENGTH_BYTES);
      const authTag = packed.subarray(
        GCM_NONCE_LENGTH_BYTES,
        GCM_NONCE_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES,
      );
      const ciphertext = packed.subarray(
        GCM_NONCE_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES,
      );

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      const parsed = JSON.parse(plaintext.toString('utf-8')) as EncryptedTokenEnvelope;

      if (!parsed || parsed.purpose !== 'EVIDENCE_DOWNLOAD' || !parsed.evidenceId || !parsed.userId) {
        throw new Error('Invalid token structure');
      }

      return parsed;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_DOWNLOAD_TOKEN',
        message: 'Download authorization token is invalid, corrupted, or tampered with.',
      });
    }
  }
}
