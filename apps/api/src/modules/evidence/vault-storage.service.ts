import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CorruptedVaultDataException,
  EncryptionService,
} from '../../common';

@Injectable()
export class VaultStorageService {
  private readonly vaultRoot: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.vaultRoot = this.resolveVaultRoot();
    this.ensureDirectoryExists(this.vaultRoot);
  }

  getVaultRoot(): string {
    return this.vaultRoot;
  }

  private resolveVaultRoot(): string {
    const envVault = process.env.EVIDENCE_VAULT_DIR;
    if (envVault && envVault.trim().length > 0) {
      return path.resolve(envVault.trim());
    }

    const configStorage =
      this.configService.get<string>('app.storagePath') ??
      process.env.STORAGE_PATH ??
      './storage';

    // Locate repository storage outside public web directories
    const candidateRepoStorage = path.resolve(
      __dirname,
      '../../../../../storage/evidence-vault',
    );
    if (fs.existsSync(path.resolve(__dirname, '../../../../../storage'))) {
      return candidateRepoStorage;
    }

    const candidateFromCwd = path.resolve(
      process.cwd(),
      configStorage,
      'evidence-vault',
    );
    return candidateFromCwd;
  }

  private ensureDirectoryExists(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `Failed to initialize evidence vault storage directory: ${msg}`,
      );
    }
  }

  /**
   * Generates a randomized, secure storage path within the vault.
   * Path format: <incidentId>/<randomUUID>.<ext>
   * Strictly prevents directory traversal.
   */
  generateVaultKey(incidentId: string, canonicalExtension: string): string {
    const cleanIncidentId = path
      .basename(incidentId)
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanIncidentId) {
      throw new BadRequestException({
        code: 'INVALID_INCIDENT_ID',
        message: 'Invalid incident identifier for storage key.',
      });
    }

    const randomName = `${crypto.randomUUID()}${canonicalExtension}`;
    const relativeKey = path.join(cleanIncidentId, randomName);

    // Verify traversal
    this.resolveAndValidatePath(relativeKey);

    return relativeKey;
  }

  /**
   * Resolves a relative storage key to an absolute path, asserting that it stays
   * strictly within the vault root.
   */
  resolveAndValidatePath(storageKey: string): string {
    if (!storageKey || storageKey.includes('\0')) {
      throw new BadRequestException({
        code: 'PATH_TRAVERSAL_DETECTED',
        message: 'Invalid storage key containing illegal null characters.',
      });
    }

    // Resolve normalized target path
    const normalizedKey = path
      .normalize(storageKey)
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.vaultRoot, normalizedKey);

    const rootWithSep = this.vaultRoot.endsWith(path.sep)
      ? this.vaultRoot
      : `${this.vaultRoot}${path.sep}`;

    if (
      !absolutePath.startsWith(rootWithSep) &&
      absolutePath !== this.vaultRoot
    ) {
      throw new BadRequestException({
        code: 'PATH_TRAVERSAL_DETECTED',
        message:
          'Path traversal attempt detected. Target path is outside the evidence vault.',
      });
    }

    return absolutePath;
  }

  /**
   * Securely saves an evidence file into the private vault with AES-256-GCM encryption at rest.
   * File bytes are encrypted using a unique nonce and authenticated tag before writing to disk.
   */
  async saveFile(
    incidentId: string,
    canonicalExtension: string,
    buffer: Buffer,
  ): Promise<{ storageKey: string; absolutePath: string }> {
    const storageKey = this.generateVaultKey(incidentId, canonicalExtension);
    const absolutePath = this.resolveAndValidatePath(storageKey);

    // Ensure the parent directory for the incident exists with strict permissions
    const incidentDir = path.dirname(absolutePath);
    await fs.promises.mkdir(incidentDir, { recursive: true, mode: 0o700 });

    // Encrypt file bytes using AES-256-GCM at rest
    const encryptedPayload = this.encryptionService.encryptBuffer(buffer);

    // Write file with restricted permissions (read/write only for application process)
    await fs.promises.writeFile(absolutePath, encryptedPayload, {
      mode: 0o600,
    });

    return { storageKey, absolutePath };
  }

  /**
   * Reads a file stream from the vault for authenticated download.
   * Decrypts AES-256-GCM encrypted files with authenticated tag verification.
   * Throws safe error if data has been tampered with or corrupted.
   */
  async getReadStream(
    storageKey: string,
  ): Promise<{ stream: Readable | fs.ReadStream; size: number }> {
    const absolutePath = this.resolveAndValidatePath(storageKey);

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) {
        throw new NotFoundException({
          code: 'EVIDENCE_FILE_NOT_FOUND',
          message: 'Evidence file not found in vault storage.',
        });
      }

      const fileBuffer = await fs.promises.readFile(absolutePath);

      // Check if file is encrypted with AES-256-GCM
      if (this.encryptionService.isVaultEncrypted(fileBuffer)) {
        try {
          const decrypted = this.encryptionService.decryptBuffer(fileBuffer);
          const stream = Readable.from(decrypted);
          return { stream, size: decrypted.length };
        } catch (err: unknown) {
          if (err instanceof CorruptedVaultDataException) {
            throw new BadRequestException({
              code: 'EVIDENCE_FILE_CORRUPTED',
              message:
                'Evidence file failed cryptographic authentication: stored data is corrupted or tampered with.',
            });
          }
          throw err;
        }
      }

      // Legacy or unencrypted raw stream
      const stream = fs.createReadStream(absolutePath);
      return { stream, size: stat.size };
    } catch (err: unknown) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Evidence file not found in vault storage.',
      });
    }
  }

  /**
   * Recalculates the SHA-256 hash of an evidence file residing in private vault storage.
   * If the file is encrypted with AES-256-GCM, it is authenticated and decrypted before hashing.
   * If ciphertext or auth-tag is corrupted, throws CorruptedVaultDataException.
   */
  async computeFileSha256(
    storageKey: string,
  ): Promise<{ sha256: string; size: number }> {
    const absolutePath = this.resolveAndValidatePath(storageKey);

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) {
        throw new NotFoundException({
          code: 'EVIDENCE_FILE_NOT_FOUND',
          message: 'Evidence file not found in vault storage.',
        });
      }

      const fileBuffer = await fs.promises.readFile(absolutePath);

      if (this.encryptionService.isVaultEncrypted(fileBuffer)) {
        const decrypted = this.encryptionService.decryptBuffer(fileBuffer);
        const hash = crypto
          .createHash('sha256')
          .update(decrypted)
          .digest('hex');
        return {
          sha256: hash,
          size: decrypted.length,
        };
      }

      // Legacy / unencrypted fallback
      const hash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');
      return {
        sha256: hash,
        size: stat.size,
      };
    } catch (err: unknown) {
      if (
        err instanceof NotFoundException ||
        err instanceof CorruptedVaultDataException
      ) {
        throw err;
      }
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Evidence file not found in vault storage.',
      });
    }
  }

  /**
   * Checks if a vaulted file exists on disk.
   */
  fileExists(storageKey: string): boolean {
    try {
      const absolutePath = this.resolveAndValidatePath(storageKey);
      return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Removes a file from the vault storage.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      const absolutePath = this.resolveAndValidatePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch {
      // Ignore deletion errors if file was already removed
    }
  }
}
