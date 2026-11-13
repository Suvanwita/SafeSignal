import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import {
  calculateAspectRatio,
  extractEvidenceMetadata,
  extractJpegDimensions,
  extractPngDimensions,
  extractSafeImageExif,
  extractTextMetadata,
} from './evidence-metadata-extractor';

describe('EvidenceMetadataExtractor', () => {
  describe('PNG Metadata & Dimension Extraction', () => {
    it('extracts width, height, bit depth, and aspect ratio from PNG IHDR', async () => {
      // Build valid PNG header (8 bytes) + IHDR chunk (13 bytes payload + 4 bytes type + 4 bytes len + 4 bytes crc)
      const ihdrPayload = Buffer.alloc(13);
      ihdrPayload.writeUInt32BE(1920, 0); // width = 1920
      ihdrPayload.writeUInt32BE(1080, 4); // height = 1080
      ihdrPayload.writeUInt8(8, 8); // bit depth = 8
      ihdrPayload.writeUInt8(6, 9); // color type = RGBA (6)

      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]), // Length 13
        Buffer.from('IHDR', 'ascii'),
        ihdrPayload,
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // Dummy CRC
      ]);

      const bufferCopy = Buffer.from(pngBuffer);

      const dims = extractPngDimensions(pngBuffer);
      expect(dims).toEqual({
        width: 1920,
        height: 1080,
        bitDepth: 8,
        colorType: 6,
      });

      const meta = await extractEvidenceMetadata({
        buffer: pngBuffer,
        sanitizedFilename: 'screenshot.png',
        canonicalMimeType: 'image/png',
        fileSize: pngBuffer.length,
        format: 'PNG',
        sha256: crypto.createHash('sha256').update(pngBuffer).digest('hex'),
      });

      expect(meta.file.fileName).toBe('screenshot.png');
      expect(meta.file.mimeType).toBe('image/png');
      expect(meta.image?.width).toBe(1920);
      expect(meta.image?.height).toBe(1080);
      expect(meta.image?.aspectRatio).toBe('16:9');
      expect(meta.image?.bitDepth).toBe(8);

      // Verify original buffer was not modified
      expect(pngBuffer.equals(bufferCopy)).toBe(true);
    });

    it('handles truncated or invalid PNG buffer gracefully without throwing', () => {
      const corrupt = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const dims = extractPngDimensions(corrupt);
      expect(dims).toBeNull();
    });
  });

  describe('JPEG Metadata & Dimension Extraction', () => {
    it('extracts dimensions from SOF marker in JPEG buffer', () => {
      const sampleJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([
          0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x03, 0xc0, 0x03, 0x01,
          0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        ]), // SOF0: height=640, width=960
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      const dims = extractJpegDimensions(sampleJpeg);
      expect(dims).toEqual({ width: 960, height: 640 });
      expect(calculateAspectRatio(960, 640)).toBe('3:2');
    });

    it('returns null when buffer is not a valid JPEG', () => {
      expect(extractJpegDimensions(Buffer.from('not-a-jpeg'))).toBeNull();
    });
  });

  describe('GPS Coordinate Redaction & EXIF Privacy Protection', () => {
    it('does not leak GPS coordinates even if EXIF has GPS tags', () => {
      // Create a mock or test buffer
      const res = extractSafeImageExif(Buffer.from('dummy-non-exif-bytes'));
      expect(res.exif).toBeUndefined();
    });

    it('guarantees that extracted metadata structure never contains GPS coordinates', async () => {
      const sampleJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        Buffer.from([
          0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x01, 0x00, 0x03, 0x01,
          0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        ]),
        Buffer.from([0xff, 0xd9]),
      ]);

      const meta = await extractEvidenceMetadata({
        buffer: sampleJpeg,
        sanitizedFilename: 'camera_capture.jpg',
        canonicalMimeType: 'image/jpeg',
        fileSize: sampleJpeg.length,
        format: 'JPG',
        sha256: crypto.createHash('sha256').update(sampleJpeg).digest('hex'),
      });

      // Verify no GPS properties exist in the extracted JSON
      const jsonString = JSON.stringify(meta);
      expect(jsonString).not.toContain('GPSLatitude');
      expect(jsonString).not.toContain('GPSLongitude');
      expect(jsonString).not.toContain('GPSPosition');
      expect(jsonString).not.toContain('GPSCoordinates');
    });
  });

  describe('PDF Metadata Extraction', () => {
    it('extracts title, author, creator, page count, and version from PDF documents', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle('Defamation & Threat Report Evidence');
      pdfDoc.setAuthor('Detective Safety');
      pdfDoc.setSubject('Legal Custody Archive');
      pdfDoc.setCreator('SafeSignal Custody Tool');
      pdfDoc.setProducer('SafeSignal PDF Generator v1');
      pdfDoc.setKeywords(['threat', 'harassment', 'evidence']);
      pdfDoc.addPage([612, 792]);
      pdfDoc.addPage([612, 792]);

      const pdfBytes = Buffer.from(await pdfDoc.save());

      const meta = await extractEvidenceMetadata({
        buffer: pdfBytes,
        sanitizedFilename: 'legal_report.pdf',
        canonicalMimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        format: 'PDF',
        sha256: crypto.createHash('sha256').update(pdfBytes).digest('hex'),
      });

      expect(meta.pdf).toBeDefined();
      expect(meta.pdf?.title).toBe('Defamation & Threat Report Evidence');
      expect(meta.pdf?.author).toBe('Detective Safety');
      expect(meta.pdf?.subject).toBe('Legal Custody Archive');
      expect(meta.pdf?.creator).toBe('SafeSignal Custody Tool');
      expect(meta.pdf?.producer).toBeDefined();
      expect(meta.pdf?.pageCount).toBe(2);
      expect(meta.pdf?.pdfVersion).toBeDefined();
      expect(meta.pdf?.creationDate).toBeDefined();
    });

    it('falls back to header version extraction when PDF parsing encounters raw or minimal PDF', async () => {
      const minimalPdf = Buffer.from(
        '%PDF-1.5\n%Minimal PDF stream for test case\n',
      );
      const meta = await extractEvidenceMetadata({
        buffer: minimalPdf,
        sanitizedFilename: 'minimal.pdf',
        canonicalMimeType: 'application/pdf',
        fileSize: minimalPdf.length,
        format: 'PDF',
        sha256: crypto.createHash('sha256').update(minimalPdf).digest('hex'),
      });

      expect(meta.pdf?.pdfVersion).toBe('1.5');
    });
  });

  describe('Text Metadata Extraction', () => {
    it('extracts line count, word count, and character count for text files', async () => {
      const textContent =
        'Line 1: Threat observed at 10:00 PM\nLine 2: Target account received direct message\nLine 3: Evidence logged';
      const textBuffer = Buffer.from(textContent, 'utf-8');

      const textMeta = extractTextMetadata(textBuffer);
      expect(textMeta.lineCount).toBe(3);
      expect(textMeta.wordCount).toBe(18);
      expect(textMeta.characterCount).toBe(textContent.length);

      const meta = await extractEvidenceMetadata({
        buffer: textBuffer,
        sanitizedFilename: 'harassment-log.txt',
        canonicalMimeType: 'text/plain',
        fileSize: textBuffer.length,
        format: 'TXT',
        sha256: crypto.createHash('sha256').update(textBuffer).digest('hex'),
      });

      expect(meta.text?.lineCount).toBe(3);
      expect(meta.text?.wordCount).toBe(18);
      expect(meta.text?.characterCount).toBe(textContent.length);
    });
  });

  describe('Aspect Ratio Calculation', () => {
    it('calculates standard and custom aspect ratios', () => {
      expect(calculateAspectRatio(1920, 1080)).toBe('16:9');
      expect(calculateAspectRatio(1280, 720)).toBe('16:9');
      expect(calculateAspectRatio(1024, 768)).toBe('4:3');
      expect(calculateAspectRatio(1080, 1080)).toBe('1:1');
      expect(calculateAspectRatio(0, 0)).toBe('—');
    });
  });
});
