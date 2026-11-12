import { BadRequestException } from '@nestjs/common';
import {
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  sanitizeEvidenceFilename,
  validateAndInspectEvidenceFile,
} from './vault-file-validator';

describe('VaultFileValidator', () => {
  function createMockFile(
    originalname: string,
    buffer: Buffer,
    mimetype = 'application/octet-stream',
  ): Express.Multer.File {
    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      buffer,
      destination: '',
      filename: originalname,
      path: '',
      stream: null as any,
    };
  }

  describe('sanitizeEvidenceFilename', () => {
    it('strips directory traversal components and dangerous characters', () => {
      expect(sanitizeEvidenceFilename('../../etc/passwd.png')).toBe('passwd.png');
      expect(sanitizeEvidenceFilename('..\\..\\windows\\system32\\cmd.jpg')).toBe(
        'cmd.jpg',
      );
      expect(sanitizeEvidenceFilename('capture:date*bad?.pdf')).toBe(
        'capture_date_bad_.pdf',
      );
      expect(sanitizeEvidenceFilename('clean_name.docx')).toBe('clean_name.docx');
    });

    it('defaults to "evidence" if name is empty or all stripped', () => {
      expect(sanitizeEvidenceFilename('')).toBe('evidence');
      expect(sanitizeEvidenceFilename(undefined)).toBe('evidence');
      expect(sanitizeEvidenceFilename('   ')).toBe('evidence');
    });
  });

  describe('validateAndInspectEvidenceFile - Allowed Formats', () => {
    it('validates a legitimate PNG file', () => {
      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('IHDR-sample-png-payload-data'),
      ]);
      const file = createMockFile('screenshot.png', pngBuffer, 'image/png');

      const result = validateAndInspectEvidenceFile(file);
      expect(result.format).toBe('PNG');
      expect(result.canonicalMimeType).toBe('image/png');
      expect(result.canonicalExtension).toBe('.png');
      expect(result.sanitizedFilename).toBe('screenshot.png');
      expect(result.sha256).toHaveLength(64);
    });

    it('validates a legitimate JPG/JPEG file', () => {
      const jpgBuffer = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.from('JFIF-sample-jpeg-payload-data'),
      ]);
      const file = createMockFile('photo.jpg', jpgBuffer, 'image/jpeg');

      const result = validateAndInspectEvidenceFile(file);
      expect(result.format).toBe('JPG');
      expect(result.canonicalMimeType).toBe('image/jpeg');
      expect(result.canonicalExtension).toBe('.jpg');
      expect(result.sanitizedFilename).toBe('photo.jpg');
      expect(result.sha256).toHaveLength(64);
    });

    it('validates a legitimate PDF document', () => {
      const pdfBuffer = Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      );
      const file = createMockFile('police_report.pdf', pdfBuffer, 'application/pdf');

      const result = validateAndInspectEvidenceFile(file);
      expect(result.format).toBe('PDF');
      expect(result.canonicalMimeType).toBe('application/pdf');
      expect(result.canonicalExtension).toBe('.pdf');
      expect(result.sanitizedFilename).toBe('police_report.pdf');
    });

    it('validates a legitimate plain text TXT file', () => {
      const txtBuffer = Buffer.from(
        'Case incident statement:\nActor threatened victim at 14:00 UTC.\nEnd of transcript.',
        'utf-8',
      );
      const file = createMockFile('notes.txt', txtBuffer, 'text/plain');

      const result = validateAndInspectEvidenceFile(file);
      expect(result.format).toBe('TXT');
      expect(result.canonicalMimeType).toBe('text/plain');
      expect(result.canonicalExtension).toBe('.txt');
      expect(result.sanitizedFilename).toBe('notes.txt');
    });

    it('validates a legitimate DOCX document with OpenXML structure', () => {
      const docxBuffer = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]), // ZIP header
        Buffer.from(
          'word-package-manifest-[Content_Types].xml-word/document.xml-end',
        ),
      ]);
      const file = createMockFile(
        'investigation.docx',
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      const result = validateAndInspectEvidenceFile(file);
      expect(result.format).toBe('DOCX');
      expect(result.canonicalMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result.canonicalExtension).toBe('.docx');
      expect(result.sanitizedFilename).toBe('investigation.docx');
    });
  });

  describe('validateAndInspectEvidenceFile - Rejections & Security Checks', () => {
    it('rejects unsupported file extensions (.exe, .sh, .zip)', () => {
      const exeBuffer = Buffer.from('MZ-fake-binary');
      const file = createMockFile('malware.exe', exeBuffer, 'application/octet-stream');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects empty file', () => {
      const emptyBuffer = Buffer.alloc(0);
      const file = createMockFile('empty.png', emptyBuffer, 'image/png');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects file exceeding size limit (15 MB)', () => {
      const largeBuffer = Buffer.alloc(MAX_EVIDENCE_FILE_SIZE_BYTES + 1024);
      // Put PNG magic bytes so it only fails on size
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largeBuffer);
      const file = createMockFile('huge.png', largeBuffer, 'image/png');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects PNG file with invalid signature (fake png)', () => {
      const fakePng = Buffer.from('NOT_A_PNG_HEADER_PAYLOAD');
      const file = createMockFile('fake.png', fakePng, 'image/png');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects JPG file with invalid signature', () => {
      const fakeJpg = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const file = createMockFile('fake.jpg', fakeJpg, 'image/jpeg');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects PDF file with invalid signature', () => {
      const fakePdf = Buffer.from('HTML <html><body>Not a PDF</body></html>');
      const file = createMockFile('fake.pdf', fakePdf, 'application/pdf');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects TXT file containing binary null bytes', () => {
      const badTxt = Buffer.from('Normal text\x00malicious-shellcode', 'latin1');
      const file = createMockFile('bad.txt', badTxt, 'text/plain');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects TXT file containing executable binary headers (e.g. MZ)', () => {
      const exeAsTxt = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1');
      const file = createMockFile('disguised.txt', exeAsTxt, 'text/plain');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects DOCX file that is a ZIP archive without OpenXML Word document structure', () => {
      const plainZip = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('not-a-word-document-random-archive-content'),
      ]);
      const file = createMockFile(
        'archive.docx',
        plainZip,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });

    it('rejects mismatched MIME types (e.g. .png with text/html MIME)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const file = createMockFile('image.png', pngBuffer, 'text/html');

      expect(() => validateAndInspectEvidenceFile(file)).toThrow(
        BadRequestException,
      );
    });
  });
});
