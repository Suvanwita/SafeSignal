import { Buffer } from 'node:buffer';
import ExifReader from 'exifreader';
import { PDFDocument } from 'pdf-lib';

export interface ImageExifMetadata {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  createDate?: string;
  modifyDate?: string;
  orientation?: number | string;
  colorSpace?: string;
  exposureTime?: string;
  fNumber?: number | string;
  iso?: number | string;
  focalLength?: string;
  lensModel?: string;
  flash?: string;
  whiteBalance?: string;
  /**
   * Indicates whether precise GPS coordinates were present in the image and
   * intentionally redacted to protect user safety and privacy.
   */
  hasRedactedGps: boolean;
  gpsRedactionNote?: string;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
  aspectRatio?: string;
  colorSpace?: string;
  bitDepth?: number;
  format: 'PNG' | 'JPG';
  exif?: ImageExifMetadata;
}

export interface PdfMetadata {
  pageCount?: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pdfVersion?: string;
}

export interface TextMetadata {
  lineCount: number;
  wordCount: number;
  characterCount: number;
}

export interface EvidenceMetadataJson {
  file: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadTimestamp: string;
    sha256: string;
    format: 'PNG' | 'JPG' | 'PDF' | 'TXT' | 'DOCX' | 'OTHER';
  };
  image?: ImageMetadata;
  pdf?: PdfMetadata;
  text?: TextMetadata;
  docx?: {
    isZipContainer: boolean;
  };
}

export interface MetadataExtractionInput {
  buffer: Buffer;
  sanitizedFilename: string;
  canonicalMimeType: string;
  fileSize: number;
  format: 'PNG' | 'JPG' | 'PDF' | 'TXT' | 'DOCX' | 'OTHER';
  sha256: string;
  uploadTimestamp?: string;
}

/**
 * Extracts width and height directly from PNG IHDR chunk (0-dependency, lightweight).
 */
export function extractPngDimensions(
  buffer: Buffer,
): { width: number; height: number; bitDepth?: number; colorType?: number } | null {
  // PNG magic header (8 bytes) + IHDR length (4 bytes) + 'IHDR' (4 bytes) = 16 bytes offset
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    try {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      const bitDepth = buffer.length > 24 ? buffer.readUInt8(24) : undefined;
      const colorType = buffer.length > 25 ? buffer.readUInt8(25) : undefined;
      if (width > 0 && height > 0) {
        return { width, height, bitDepth, colorType };
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Scans JPEG SOF (Start of Frame) markers to determine width and height
 * without external dependencies.
 */
export function extractJpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // EOI (0xD9) or SOS (0xDA)
    if (marker === 0xd9 || marker === 0xda) break;
    // RST markers
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    // SOF markers
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Calculates a human-readable aspect ratio from width and height (e.g. 16:9, 4:3, 1:1).
 */
export function calculateAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '—';
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  const divisor = gcd(width, height);
  const ratioW = width / divisor;
  const ratioH = height / divisor;
  // If common standard ratios
  if (ratioW <= 32 && ratioH <= 32) {
    return `${ratioW}:${ratioH}`;
  }
  return (width / height).toFixed(2) + ':1';
}

/**
 * Extracts non-sensitive EXIF tags from image buffer, strictly stripping precise GPS coordinates.
 */
export function extractSafeImageExif(
  buffer: Buffer,
): { exif?: ImageExifMetadata; width?: number; height?: number } {
  try {
    const tags = ExifReader.load(buffer, { expanded: true });
    if (!tags) return {};

    // Check whether GPS metadata is present in the image
    let hasGps = false;
    if (tags.gps && Object.keys(tags.gps).length > 0) {
      hasGps = true;
    }

    // Inspect individual tags for any GPS keys
    for (const key of Object.keys(tags)) {
      if (key.toLowerCase().startsWith('gps')) {
        hasGps = true;
        break;
      }
    }

    const exifData = tags.exif || {};
    const fileData = tags.file || {};

    const width =
      (fileData['Image Width']?.value as number) ||
      (exifData.PixelXDimension?.value as number) ||
      (exifData.ImageWidth?.value as number);

    const height =
      (fileData['Image Height']?.value as number) ||
      (exifData.PixelYDimension?.value as number) ||
      (exifData.ImageLength?.value as number);

    // Filter to safe, non-identifying technical metadata ONLY.
    // Strictly omit GPS coordinates, device serial numbers, owner names, etc.
    const rawExif = exifData as Record<string, any>;
    const exif: ImageExifMetadata = {
      make: exifData.Make?.description,
      model: exifData.Model?.description,
      software: exifData.Software?.description,
      dateTimeOriginal: exifData.DateTimeOriginal?.description,
      createDate: rawExif.CreateDate?.description,
      modifyDate: rawExif.ModifyDate?.description,
      orientation: exifData.Orientation?.description,
      colorSpace: exifData.ColorSpace?.description,
      exposureTime: exifData.ExposureTime?.description,
      fNumber: exifData.FNumber?.description,
      iso: exifData.ISOSpeedRatings?.description,
      focalLength: exifData.FocalLength?.description,
      lensModel: exifData.LensModel?.description,
      flash: exifData.Flash?.description,
      whiteBalance: exifData.WhiteBalance?.description,
      hasRedactedGps: hasGps,
      gpsRedactionNote: hasGps
        ? 'Precise GPS coordinates detected and redacted for user privacy and physical safety.'
        : undefined,
    };

    // Remove undefined properties
    const cleanedExif = Object.fromEntries(
      Object.entries(exif).filter(([, v]) => v !== undefined),
    ) as ImageExifMetadata;

    return {
      exif: Object.keys(cleanedExif).length > 1 ? cleanedExif : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
    };
  } catch {
    // If not a JPEG/TIFF with EXIF or invalid EXIF header, return empty
    return {};
  }
}

/**
 * Extracts metadata from PDF documents using lightweight pure TypeScript `pdf-lib`.
 */
export async function extractPdfMetadata(
  buffer: Buffer,
): Promise<PdfMetadata | undefined> {
  try {
    // Extract version header: e.g. %PDF-1.4 -> 1.4
    const headerStr = buffer.subarray(0, 32).toString('ascii');
    const versionMatch = headerStr.match(/%PDF-([0-9.]+)/);
    const pdfVersion = versionMatch ? versionMatch[1] : undefined;

    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    const title = doc.getTitle();
    const author = doc.getAuthor();
    const subject = doc.getSubject();
    const rawKeywords = doc.getKeywords();
    const keywords = rawKeywords
      ? rawKeywords.split(/[,;\s]+/).map((k) => k.trim()).filter(Boolean)
      : undefined;
    const creator = doc.getCreator();
    const producer = doc.getProducer();
    const creationDate = doc.getCreationDate()?.toISOString();
    const modificationDate = doc.getModificationDate()?.toISOString();
    const pageCount = doc.getPageCount();

    const pdfMeta: PdfMetadata = {
      pageCount,
      title: title && title.trim().length > 0 ? title.trim() : undefined,
      author: author && author.trim().length > 0 ? author.trim() : undefined,
      subject: subject && subject.trim().length > 0 ? subject.trim() : undefined,
      keywords: keywords && keywords.length > 0 ? keywords : undefined,
      creator: creator && creator.trim().length > 0 ? creator.trim() : undefined,
      producer: producer && producer.trim().length > 0 ? producer.trim() : undefined,
      creationDate,
      modificationDate,
      pdfVersion,
    };

    const cleaned = Object.fromEntries(
      Object.entries(pdfMeta).filter(([, v]) => v !== undefined),
    ) as PdfMetadata;

    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  } catch {
    // Fallback: extract version string from raw header if PDFDocument fails (e.g. encrypted)
    const headerStr = buffer.subarray(0, 32).toString('ascii');
    const versionMatch = headerStr.match(/%PDF-([0-9.]+)/);
    if (versionMatch) {
      return { pdfVersion: versionMatch[1] };
    }
    return undefined;
  }
}

/**
 * Extracts line, word, and character metrics for plain text evidence files.
 */
export function extractTextMetadata(buffer: Buffer): TextMetadata {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r\n|\r|\n/);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return {
    lineCount: lines.length,
    wordCount: words,
    characterCount: text.length,
  };
}

/**
 * Primary extractor: extracts structured JSON metadata from uploaded evidence bytes.
 * Strictly guarantees that the original file buffer is NEVER modified.
 * Protects user safety by withholding sensitive EXIF geolocation (GPS coordinates).
 */
export async function extractEvidenceMetadata(
  input: MetadataExtractionInput,
): Promise<EvidenceMetadataJson> {
  const uploadTimestamp = input.uploadTimestamp || new Date().toISOString();

  const result: EvidenceMetadataJson = {
    file: {
      fileName: input.sanitizedFilename,
      mimeType: input.canonicalMimeType,
      fileSize: input.fileSize,
      uploadTimestamp,
      sha256: input.sha256,
      format: input.format,
    },
  };

  // Image Metadata Extraction (PNG & JPG)
  if (input.format === 'PNG') {
    const pngDims = extractPngDimensions(input.buffer);
    if (pngDims) {
      result.image = {
        width: pngDims.width,
        height: pngDims.height,
        aspectRatio: calculateAspectRatio(pngDims.width, pngDims.height),
        bitDepth: pngDims.bitDepth,
        format: 'PNG',
      };
    }
  } else if (input.format === 'JPG') {
    const exifData = extractSafeImageExif(input.buffer);
    let dims = extractJpegDimensions(input.buffer);
    const width = dims?.width || exifData.width;
    const height = dims?.height || exifData.height;

    result.image = {
      width,
      height,
      aspectRatio: width && height ? calculateAspectRatio(width, height) : undefined,
      format: 'JPG',
      exif: exifData.exif,
    };
  } else if (input.format === 'PDF') {
    const pdfMeta = await extractPdfMetadata(input.buffer);
    if (pdfMeta) {
      result.pdf = pdfMeta;
    }
  } else if (input.format === 'TXT') {
    result.text = extractTextMetadata(input.buffer);
  } else if (input.format === 'DOCX') {
    result.docx = {
      isZipContainer:
        input.buffer.length >= 4 &&
        input.buffer[0] === 0x50 &&
        input.buffer[1] === 0x4b,
    };
  }

  return result;
}
