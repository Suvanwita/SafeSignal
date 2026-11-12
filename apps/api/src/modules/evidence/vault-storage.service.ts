import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VaultStorageService {
  private readonly vaultRoot: string;

  constructor(private readonly configService: ConfigService) {
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
    // Sanitize incidentId to avoid any nested traversal characters
    const cleanIncidentId = path.basename(incidentId).replace(/[^a-zA-Z0-9_-]/g, '');
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
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.vaultRoot, normalizedKey);

    const rootWithSep = this.vaultRoot.endsWith(path.sep)
      ? this.vaultRoot
      : `${this.vaultRoot}${path.sep}`;

    if (!absolutePath.startsWith(rootWithSep) && absolutePath !== this.vaultRoot) {
      throw new BadRequestException({
        code: 'PATH_TRAVERSAL_DETECTED',
        message: 'Path traversal attempt detected. Target path is outside the evidence vault.',
      });
    }

    return absolutePath;
  }

  /**
   * Securely saves a validated file buffer into the private vault.
   */
  async saveFile(
    incidentId: string,
    canonicalExtension: string,
    buffer: Buffer,
  ): Promise<{ storageKey: string; absolutePath: string }> {
    const storageKey = this.generateVaultKey(incidentId, canonicalExtension);
    const absolutePath = this.resolveAndValidatePath(storageKey);

    // Ensure the parent directory for the incident exists
    const incidentDir = path.dirname(absolutePath);
    await fs.promises.mkdir(incidentDir, { recursive: true, mode: 0o700 });

    // Write file with restricted permissions (read/write only for application process)
    await fs.promises.writeFile(absolutePath, buffer, { mode: 0o600 });

    return { storageKey, absolutePath };
  }

  /**
   * Reads a file stream from the vault for authenticated download.
   */
  async getReadStream(
    storageKey: string,
  ): Promise<{ stream: fs.ReadStream; size: number }> {
    const absolutePath = this.resolveAndValidatePath(storageKey);

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) {
        throw new NotFoundException({
          code: 'EVIDENCE_FILE_NOT_FOUND',
          message: 'Evidence file not found in vault storage.',
        });
      }
      const stream = fs.createReadStream(absolutePath);
      return { stream, size: stat.size };
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'Evidence file not found in vault storage.',
      });
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
