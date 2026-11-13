import crypto from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CorruptedVaultDataException,
  EncryptionConfigurationException,
  EncryptionService,
} from './encryption.service';

describe('EncryptionService (AES-256-GCM)', () => {
  const validHexKey = crypto.randomBytes(32).toString('hex');
  const validBase64Key = crypto.randomBytes(32).toString('base64');

  function createService(key: string | undefined): EncryptionService {
    const configService = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === 'app.evidenceEncryptionKey') return key;
        return undefined;
      }),
    } as unknown as ConfigService;

    // Ensure process.env does not leak into test
    const origEnv = process.env.EVIDENCE_ENCRYPTION_KEY;
    const origLegacy = process.env.ENCRYPTION_KEY;
    delete process.env.EVIDENCE_ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    try {
      return new EncryptionService(configService);
    } finally {
      if (origEnv) process.env.EVIDENCE_ENCRYPTION_KEY = origEnv;
      if (origLegacy) process.env.ENCRYPTION_KEY = origLegacy;
    }
  }

  describe('Key Loading & Validation', () => {
    it('loads 32-byte key from hex-encoded environment string', () => {
      const service = createService(validHexKey);
      expect(service).toBeDefined();
    });

    it('loads 32-byte key from base64-encoded environment string', () => {
      const service = createService(validBase64Key);
      expect(service).toBeDefined();
    });

    it('throws EncryptionConfigurationException when key is missing or empty', () => {
      expect(() => createService('')).toThrow(EncryptionConfigurationException);
      expect(() => createService(undefined)).toThrow(
        EncryptionConfigurationException,
      );
    });

    it('throws EncryptionConfigurationException when key is invalid length', () => {
      // 16 bytes hex (32 chars) instead of 32 bytes (64 chars)
      expect(() => createService('abcdef0123456789abcdef0123456789')).toThrow(
        EncryptionConfigurationException,
      );
    });
  });

  describe('Buffer Encryption & Authenticated Decryption', () => {
    let service: EncryptionService;

    beforeEach(() => {
      service = createService(validHexKey);
    });

    it('encrypts and decrypts buffer successfully using AES-256-GCM', () => {
      const original = Buffer.from('Sensitive victim evidence data capture #101', 'utf-8');
      const encrypted = service.encryptBuffer(original);

      expect(service.isVaultEncrypted(encrypted)).toBe(true);
      expect(encrypted.length).toBeGreaterThan(original.length);

      const decrypted = service.decryptBuffer(encrypted);
      expect(decrypted.equals(original)).toBe(true);
      expect(decrypted.toString('utf-8')).toBe(original.toString('utf-8'));
    });

    it('guarantees unique nonces on every encryption operation (semantic security)', () => {
      const plaintext = Buffer.from('Confidential statement text', 'utf-8');
      const enc1 = service.encryptBuffer(plaintext);
      const enc2 = service.encryptBuffer(plaintext);

      // Nonce is bytes 7..19
      const nonce1 = enc1.subarray(7, 19);
      const nonce2 = enc2.subarray(7, 19);

      expect(nonce1.equals(nonce2)).toBe(false);
      // Entire ciphertext must be distinct even for identical plaintext
      expect(enc1.equals(enc2)).toBe(false);

      // But both decrypt back to the identical plaintext
      expect(service.decryptBuffer(enc1).toString('utf-8')).toBe(
        plaintext.toString('utf-8'),
      );
      expect(service.decryptBuffer(enc2).toString('utf-8')).toBe(
        plaintext.toString('utf-8'),
      );
    });

    it('throws CorruptedVaultDataException when ciphertext is tampered with', () => {
      const original = Buffer.from('Original untampered evidence bytes', 'utf-8');
      const encrypted = service.encryptBuffer(original);

      // Tamper with ciphertext (after 35-byte header)
      const tampered = Buffer.from(encrypted);
      tampered[36] = tampered[36] ^ 0xff; // flip bits

      expect(() => service.decryptBuffer(tampered)).toThrow(
        CorruptedVaultDataException,
      );
    });

    it('throws CorruptedVaultDataException when authentication tag is tampered with', () => {
      const original = Buffer.from('Original untampered evidence bytes', 'utf-8');
      const encrypted = service.encryptBuffer(original);

      // Tamper with GCM auth tag (bytes 19..35)
      const tampered = Buffer.from(encrypted);
      tampered[22] = tampered[22] ^ 0xaa;

      expect(() => service.decryptBuffer(tampered)).toThrow(
        CorruptedVaultDataException,
      );
    });

    it('passes through unencrypted legacy buffers cleanly', () => {
      const legacyRaw = Buffer.from('Legacy unencrypted raw image bytes', 'utf-8');
      expect(service.isVaultEncrypted(legacyRaw)).toBe(false);

      const result = service.decryptBuffer(legacyRaw);
      expect(result.equals(legacyRaw)).toBe(true);
    });
  });

  describe('Single-Purpose Download Token Encryption', () => {
    let service: EncryptionService;

    beforeEach(() => {
      service = createService(validHexKey);
    });

    it('encrypts and decrypts single-purpose download token payload', () => {
      const payload = {
        evidenceId: 'e28bbd9f-9c02-4e89-9a2f-e7583a4c0001',
        userId: 'u11bbd9f-9c02-4e89-9a2f-e7583a4c0002',
        jti: 'j33bbd9f-9c02-4e89-9a2f-e7583a4c0003',
        exp: Date.now() + 60_000,
        purpose: 'EVIDENCE_DOWNLOAD' as const,
      };

      const token = service.encryptDownloadToken(payload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(30);

      const decrypted = service.decryptDownloadToken(token);
      expect(decrypted.evidenceId).toBe(payload.evidenceId);
      expect(decrypted.userId).toBe(payload.userId);
      expect(decrypted.jti).toBe(payload.jti);
      expect(decrypted.purpose).toBe('EVIDENCE_DOWNLOAD');
    });

    it('rejects tampered or forged download tokens with UnauthorizedException', () => {
      const payload = {
        evidenceId: 'e28bbd9f-9c02-4e89-9a2f-e7583a4c0001',
        userId: 'u11bbd9f-9c02-4e89-9a2f-e7583a4c0002',
        jti: 'j33bbd9f-9c02-4e89-9a2f-e7583a4c0003',
        exp: Date.now() + 60_000,
        purpose: 'EVIDENCE_DOWNLOAD' as const,
      };

      const token = service.encryptDownloadToken(payload);
      // Corrupt a character in the token string
      const corrupted =
        token.slice(0, 10) +
        (token[10] === 'a' ? 'b' : 'a') +
        token.slice(11);

      expect(() => service.decryptDownloadToken(corrupted)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects empty or malformed token strings with UnauthorizedException', () => {
      expect(() => service.decryptDownloadToken('')).toThrow(
        UnauthorizedException,
      );
      expect(() => service.decryptDownloadToken('short')).toThrow(
        UnauthorizedException,
      );
    });
  });
});
