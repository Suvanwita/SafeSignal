import crypto from 'node:crypto';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export type AllowedEvidenceFormat = 'PNG' | 'JPG' | 'PDF' | 'TXT' | 'DOCX';

export interface ValidatedEvidenceFile {
  sanitizedFilename: string;
  canonicalMimeType: string;
  canonicalExtension: string;
  format: AllowedEvidenceFormat;
  fileSize: number;
  sha256: string;
}

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.txt',
  '.docx',
]);

const ALLOWED_MIME_BY_EXT: Record<string, string[]> = {
  '.png': ['image/png', 'application/octet-stream'],
  '.jpg': [
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'application/octet-stream',
  ],
  '.jpeg': [
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'application/octet-stream',
  ],
  '.pdf': [
    'application/pdf',
    'application/x-pdf',
    'application/octet-stream',
  ],
  '.txt': ['text/plain', 'text/x-log', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ],
};

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function sanitizeEvidenceFilename(rawName: string | undefined): string {
  if (!rawName) return 'evidence';
  // Normalize both forward and back slashes regardless of host OS
  const normalized = rawName.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  const cleaned = base
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\0-\x1F\x7F]/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : 'evidence';
}

export function validateAndInspectEvidenceFile(
  file: Express.Multer.File,
): ValidatedEvidenceFile {
  if (!file || !file.buffer) {
    throw new BadRequestException({
      code: 'FILE_REQUIRED',
      message: 'No file data received for evidence upload.',
    });
  }

  const fileSize = file.buffer.length;
  if (fileSize === 0) {
    throw new BadRequestException({
      code: 'FILE_EMPTY',
      message: 'Uploaded evidence file cannot be empty.',
    });
  }

  if (fileSize > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    throw new BadRequestException({
      code: 'FILE_TOO_LARGE',
      message: `Evidence file size (${(fileSize / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of 15 MB.`,
    });
  }

  const sanitizedFilename = sanitizeEvidenceFilename(file.originalname);
  const ext = path.extname(sanitizedFilename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException({
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `File extension "${ext || 'none'}" is not allowed. Allowed formats are PNG (.png), JPG/JPEG (.jpg, .jpeg), PDF (.pdf), TXT (.txt), and DOCX (.docx).`,
    });
  }

  const clientMime = (file.mimetype || '').toLowerCase().trim();
  const allowedMimes = ALLOWED_MIME_BY_EXT[ext] || [];
  if (clientMime && !allowedMimes.includes(clientMime)) {
    throw new BadRequestException({
      code: 'INVALID_MIME_TYPE',
      message: `MIME type "${file.mimetype}" does not match the file extension "${ext}".`,
    });
  }

  let canonicalMimeType: string;
  let canonicalExtension: string;
  let format: AllowedEvidenceFormat;

  switch (ext) {
    case '.png': {
      if (
        file.buffer.length < PNG_MAGIC.length ||
        !file.buffer.subarray(0, 8).equals(PNG_MAGIC)
      ) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message: 'File signature mismatch: file is not a valid PNG image.',
        });
      }
      canonicalMimeType = 'image/png';
      canonicalExtension = '.png';
      format = 'PNG';
      break;
    }

    case '.jpg':
    case '.jpeg': {
      if (
        file.buffer.length < JPEG_SOI.length ||
        file.buffer[0] !== 0xff ||
        file.buffer[1] !== 0xd8 ||
        file.buffer[2] !== 0xff
      ) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message: 'File signature mismatch: file is not a valid JPEG image.',
        });
      }
      canonicalMimeType = 'image/jpeg';
      canonicalExtension = ext === '.jpeg' ? '.jpeg' : '.jpg';
      format = 'JPG';
      break;
    }

    case '.pdf': {
      if (
        file.buffer.length < PDF_MAGIC.length ||
        !file.buffer.subarray(0, 5).equals(PDF_MAGIC)
      ) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message: 'File signature mismatch: file is not a valid PDF document.',
        });
      }
      canonicalMimeType = 'application/pdf';
      canonicalExtension = '.pdf';
      format = 'PDF';
      break;
    }

    case '.txt': {
      if (file.buffer.includes(0x00)) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message:
            'Text file contains forbidden binary null bytes (potential binary payload).',
        });
      }

      if (
        (file.buffer[0] === 0x4d && file.buffer[1] === 0x5a) ||
        (file.buffer[0] === 0x7f &&
          file.buffer[1] === 0x45 &&
          file.buffer[2] === 0x4c &&
          file.buffer[3] === 0x46) ||
        (file.buffer[0] === 0x50 &&
          file.buffer[1] === 0x4b &&
          file.buffer[2] === 0x03 &&
          file.buffer[3] === 0x04) ||
        (file.buffer[0] === 0x1f && file.buffer[1] === 0x8b) ||
        (file.buffer[0] === 0x89 &&
          file.buffer[1] === 0x50 &&
          file.buffer[2] === 0x4e &&
          file.buffer[3] === 0x47) ||
        (file.buffer[0] === 0xff &&
          file.buffer[1] === 0xd8 &&
          file.buffer[2] === 0xff) ||
        (file.buffer[0] === 0x25 &&
          file.buffer[1] === 0x50 &&
          file.buffer[2] === 0x44 &&
          file.buffer[3] === 0x46)
      ) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message:
            'Text file cannot contain binary executable or archive signatures.',
        });
      }

      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(file.buffer);
      } catch {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message: 'Text file is not valid UTF-8 text.',
        });
      }

      canonicalMimeType = 'text/plain';
      canonicalExtension = '.txt';
      format = 'TXT';
      break;
    }

    case '.docx': {
      if (
        file.buffer.length < ZIP_MAGIC.length ||
        !file.buffer.subarray(0, 4).equals(ZIP_MAGIC)
      ) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message:
            'File signature mismatch: file is not a valid DOCX/ZIP package.',
        });
      }

      const bufferStr = file.buffer.toString('latin1');
      const hasOpenXml =
        bufferStr.includes('[Content_Types].xml') ||
        bufferStr.includes('word/');

      if (!hasOpenXml) {
        throw new BadRequestException({
          code: 'INVALID_FILE_SIGNATURE',
          message:
            'DOCX file is missing required Word OpenXML package structure.',
        });
      }

      canonicalMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      canonicalExtension = '.docx';
      format = 'DOCX';
      break;
    }

    default: {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: `Unsupported file format "${ext}".`,
      });
    }
  }

  const sha256 = crypto
    .createHash('sha256')
    .update(file.buffer)
    .digest('hex');

  return {
    sanitizedFilename,
    canonicalMimeType,
    canonicalExtension,
    format,
    fileSize,
    sha256,
  };
}
