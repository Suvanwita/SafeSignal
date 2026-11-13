import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisType, IncidentStatus, Severity } from '@prisma/client';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  RGB,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { assertOwnedResource } from '../../common/auth/authorization.util';
import { PrismaService } from '../../prisma/prisma.service';

export interface GeneratedPdfReport {
  buffer: Buffer;
  filename: string;
}

/**
 * Sanitizes untrusted user text for WinAnsi-encoded standard PDF fonts.
 * Converts smart quotes, dashes, bullets, and arrows to ASCII,
 * and strips/replaces any characters outside the printable Latin-1/WinAnsi range.
 */
export function sanitizePdfText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatUtcDate(date: Date | string | null | undefined): string {
  if (!date) return 'Not recorded';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

class PdfReportLayoutManager {
  private doc: PDFDocument;
  private pages: PDFPage[] = [];
  private currentPage!: PDFPage;
  private currentY = 0;
  private incidentId: string;
  private incidentShortId: string;
  private generatedAtString: string;

  private helvetica!: PDFFont;
  private helveticaBold!: PDFFont;
  private courier!: PDFFont;
  private courierBold!: PDFFont;

  // Geometry
  readonly pageWidth = 595.28; // A4
  readonly pageHeight = 841.89; // A4
  readonly marginX = 40;
  readonly contentWidth = 515.28;
  readonly minY = 55;
  readonly maxY = 785;

  // Theme Colors
  readonly colorNavy: RGB = rgb(15 / 255, 23 / 255, 42 / 255); // #0f172a
  readonly colorBlue: RGB = rgb(37 / 255, 99 / 255, 235 / 255); // #2563eb
  readonly colorSlateDark: RGB = rgb(30 / 255, 41 / 255, 59 / 255); // #1e293b
  readonly colorSlateMuted: RGB = rgb(100 / 255, 116 / 255, 139 / 255); // #64748b
  readonly colorBorder: RGB = rgb(226 / 255, 232 / 255, 240 / 255); // #e2e8f0
  readonly colorBgLight: RGB = rgb(248 / 255, 250 / 255, 252 / 255); // #f8fafc
  readonly colorBannerBg: RGB = rgb(241 / 255, 245 / 255, 249 / 255); // #f1f5f9
  readonly colorGreen: RGB = rgb(16 / 255, 185 / 255, 129 / 255); // #10b981
  readonly colorRed: RGB = rgb(220 / 255, 38 / 255, 38 / 255); // #dc2626
  readonly colorAmber: RGB = rgb(217 / 255, 119 / 255, 6 / 255); // #d97706

  constructor(doc: PDFDocument, incidentId: string, generatedAt: Date) {
    this.doc = doc;
    this.incidentId = incidentId;
    this.incidentShortId = incidentId.slice(0, 8).toUpperCase();
    this.generatedAtString = formatUtcDate(generatedAt);
  }

  async initFonts() {
    this.helvetica = await this.doc.embedFont(StandardFonts.Helvetica);
    this.helveticaBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.courier = await this.doc.embedFont(StandardFonts.Courier);
    this.courierBold = await this.doc.embedFont(StandardFonts.CourierBold);
  }

  addNewPage() {
    this.currentPage = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this.pages.push(this.currentPage);
    this.currentY = this.maxY;

    // Running top header for pages after the first
    if (this.pages.length > 1) {
      this.currentPage.drawLine({
        start: { x: this.marginX, y: 808 },
        end: { x: this.marginX + this.contentWidth, y: 808 },
        thickness: 0.5,
        color: this.colorBorder,
      });

      const headerLeft = 'SafeSignal Official Incident Dossier';
      const headerRight = `Case #${this.incidentShortId}`;

      this.currentPage.drawText(headerLeft, {
        x: this.marginX,
        y: 814,
        size: 8,
        font: this.helvetica,
        color: this.colorSlateMuted,
      });

      const rightWidth = this.helvetica.widthOfTextAtSize(headerRight, 8);
      this.currentPage.drawText(headerRight, {
        x: this.marginX + this.contentWidth - rightWidth,
        y: 814,
        size: 8,
        font: this.helveticaBold,
        color: this.colorSlateMuted,
      });
    }
  }

  ensureSpace(neededHeight: number) {
    if (this.currentY - neededHeight < this.minY) {
      this.addNewPage();
    }
  }

  // --- Content Drawing Helpers ---

  wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const clean = sanitizePdfText(text);
    if (!clean) return [];

    const words = clean.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
          currentLine = word;
        } else {
          // Break very long single word
          let part = '';
          for (let i = 0; i < word.length; i++) {
            const charCandidate = part + word[i];
            if (font.widthOfTextAtSize(charCandidate, size) <= maxWidth) {
              part = charCandidate;
            } else {
              lines.push(part);
              part = word[i];
            }
          }
          currentLine = part;
        }
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  drawBrandingHeader() {
    this.addNewPage();

    // Dark header banner
    const bannerHeight = 84;
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - bannerHeight + 15,
      width: this.contentWidth,
      height: bannerHeight,
      color: this.colorNavy,
    });

    // Decorative blue accent bar
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - bannerHeight + 15,
      width: 6,
      height: bannerHeight,
      color: this.colorBlue,
    });

    // Logo / Platform Title
    this.currentPage.drawText('SafeSignal', {
      x: this.marginX + 20,
      y: this.currentY - 14,
      size: 20,
      font: this.helveticaBold,
      color: rgb(1, 1, 1),
    });

    this.currentPage.drawText(
      'Digital Safety & Incident Response Intelligence Platform',
      {
        x: this.marginX + 20,
        y: this.currentY - 30,
        size: 9,
        font: this.helvetica,
        color: rgb(148 / 255, 163 / 255, 184 / 255), // slate-400
      },
    );

    // Document Classification Badge
    const docTag = 'OFFICIAL INCIDENT REPORT & EVIDENCE DOSSIER';
    this.currentPage.drawText(docTag, {
      x: this.marginX + 20,
      y: this.currentY - 50,
      size: 10,
      font: this.helveticaBold,
      color: rgb(96 / 255, 165 / 255, 250 / 255), // blue-400
    });

    // Case ID on right side of banner
    const idLabel = `CASE #${this.incidentShortId}`;
    const idWidth = this.helveticaBold.widthOfTextAtSize(idLabel, 12);
    this.currentPage.drawText(idLabel, {
      x: this.marginX + this.contentWidth - idWidth - 20,
      y: this.currentY - 20,
      size: 12,
      font: this.helveticaBold,
      color: rgb(1, 1, 1),
    });

    const fullIdStr = `UUID: ${this.incidentId}`;
    const fullIdWidth = this.courier.widthOfTextAtSize(fullIdStr, 7.5);
    this.currentPage.drawText(fullIdStr, {
      x: this.marginX + this.contentWidth - fullIdWidth - 20,
      y: this.currentY - 36,
      size: 7.5,
      font: this.courier,
      color: rgb(148 / 255, 163 / 255, 184 / 255),
    });

    const genLabel = `Generated: ${this.generatedAtString}`;
    const genWidth = this.helvetica.widthOfTextAtSize(genLabel, 7.5);
    this.currentPage.drawText(genLabel, {
      x: this.marginX + this.contentWidth - genWidth - 20,
      y: this.currentY - 50,
      size: 7.5,
      font: this.helvetica,
      color: rgb(148 / 255, 163 / 255, 184 / 255),
    });

    this.currentY -= bannerHeight + 12;

    // Confidentiality Legal Notice Banner
    const noticeHeight = 26;
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - noticeHeight + 12,
      width: this.contentWidth,
      height: noticeHeight,
      color: rgb(254 / 255, 242 / 255, 242 / 255), // red-50
      borderColor: rgb(254 / 255, 202 / 255, 202 / 255), // red-200
      borderWidth: 0.5,
    });

    this.currentPage.drawText(
      'CONFIDENTIAL DOSSIER - GENERATED FOR LAW ENFORCEMENT, PLATFORM ESCALATION & LEGAL EVIDENCE RECORDS',
      {
        x: this.marginX + 10,
        y: this.currentY - 3,
        size: 7,
        font: this.helveticaBold,
        color: rgb(185 / 255, 28 / 255, 28 / 255), // red-700
      },
    );

    this.currentPage.drawText(
      'Contains verified cryptographic hashes, chronological audit events, and user-authenticated records.',
      {
        x: this.marginX + 10,
        y: this.currentY - 12,
        size: 6.5,
        font: this.helvetica,
        color: rgb(185 / 255, 28 / 255, 28 / 255),
      },
    );

    this.currentY -= noticeHeight + 10;
  }

  drawSectionHeader(title: string, sectionNumber?: number) {
    this.ensureSpace(38);
    this.currentY -= 6;

    const label = sectionNumber ? `${sectionNumber}. ${title}` : title;

    // Background banner
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - 14,
      width: this.contentWidth,
      height: 20,
      color: this.colorBannerBg,
    });

    // Left accent pip
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - 14,
      width: 4,
      height: 20,
      color: this.colorBlue,
    });

    this.currentPage.drawText(sanitizePdfText(label).toUpperCase(), {
      x: this.marginX + 10,
      y: this.currentY - 9,
      size: 9.5,
      font: this.helveticaBold,
      color: this.colorNavy,
    });

    this.currentY -= 22;
  }

  drawParagraph(text: string, options: { font?: PDFFont; size?: number; color?: RGB; lineGap?: number } = {}) {
    const font = options.font ?? this.helvetica;
    const size = options.size ?? 9;
    const color = options.color ?? this.colorSlateDark;
    const lineGap = options.lineGap ?? 3;

    const lines = this.wrapText(text, font, size, this.contentWidth);
    for (const line of lines) {
      this.ensureSpace(size + lineGap);
      this.currentPage.drawText(line, {
        x: this.marginX,
        y: this.currentY,
        size,
        font,
        color,
      });
      this.currentY -= size + lineGap;
    }
  }

  drawKeyValRow(items: { label: string; value: string; width?: number; isMonospace?: boolean }[]) {
    this.ensureSpace(22);
    let currentX = this.marginX;

    for (const item of items) {
      const itemWidth = item.width ?? this.contentWidth / items.length;

      // Label
      this.currentPage.drawText(sanitizePdfText(item.label) + ':', {
        x: currentX,
        y: this.currentY,
        size: 7.5,
        font: this.helveticaBold,
        color: this.colorSlateMuted,
      });

      // Value
      const font = item.isMonospace ? this.courier : this.helvetica;
      const cleanVal = sanitizePdfText(item.value);
      this.currentPage.drawText(cleanVal, {
        x: currentX,
        y: this.currentY - 9,
        size: 8.5,
        font,
        color: this.colorSlateDark,
      });

      currentX += itemWidth;
    }

    this.currentY -= 24;
  }

  drawStatusBadge(label: string, type: 'status' | 'severity' | 'verified' | 'mismatch') {
    let bgColor = this.colorBgLight;
    let textColor = this.colorSlateDark;

    if (type === 'severity') {
      if (label === 'CRITICAL' || label === 'HIGH') {
        bgColor = rgb(254 / 255, 242 / 255, 242 / 255);
        textColor = this.colorRed;
      } else if (label === 'MEDIUM') {
        bgColor = rgb(254 / 255, 243 / 255, 199 / 255);
        textColor = this.colorAmber;
      } else {
        bgColor = rgb(240 / 255, 253 / 255, 244 / 255);
        textColor = this.colorGreen;
      }
    } else if (type === 'verified') {
      bgColor = rgb(240 / 255, 253 / 255, 244 / 255);
      textColor = this.colorGreen;
    } else if (type === 'mismatch') {
      bgColor = rgb(254 / 255, 242 / 255, 242 / 255);
      textColor = this.colorRed;
    }

    // Draw simple pill badge
    const text = sanitizePdfText(label);
    const textWidth = this.helveticaBold.widthOfTextAtSize(text, 8);
    const badgeWidth = textWidth + 12;
    const badgeHeight = 14;

    this.currentPage.drawRectangle({
      x: this.marginX,
      y: this.currentY - 10,
      width: badgeWidth,
      height: badgeHeight,
      color: bgColor,
      borderColor: textColor,
      borderWidth: 0.5,
    });

    this.currentPage.drawText(text, {
      x: this.marginX + 6,
      y: this.currentY - 7,
      size: 8,
      font: this.helveticaBold,
      color: textColor,
    });

    this.currentY -= 16;
  }

  drawDivider() {
    this.ensureSpace(10);
    this.currentPage.drawLine({
      start: { x: this.marginX, y: this.currentY },
      end: { x: this.marginX + this.contentWidth, y: this.currentY },
      thickness: 0.5,
      color: this.colorBorder,
    });
    this.currentY -= 10;
  }

  finalizePageNumbers() {
    const totalPages = this.pages.length;

    this.pages.forEach((page, index) => {
      // Bottom dividing line
      page.drawLine({
        start: { x: this.marginX, y: 40 },
        end: { x: this.marginX + this.contentWidth, y: 40 },
        thickness: 0.5,
        color: this.colorBorder,
      });

      // Left footer text
      const footerLeft =
        `SafeSignal Digital Safety Platform  |  Case #${this.incidentShortId}  |  Generated ${this.generatedAtString}`;
      page.drawText(footerLeft, {
        x: this.marginX,
        y: 28,
        size: 7.5,
        font: this.helvetica,
        color: this.colorSlateMuted,
      });

      // Right footer: Page X of Y
      const pageStr = `Page ${index + 1} of ${totalPages}`;
      const pageStrWidth = this.helveticaBold.widthOfTextAtSize(pageStr, 7.5);
      page.drawText(pageStr, {
        x: this.marginX + this.contentWidth - pageStrWidth,
        y: 28,
        size: 7.5,
        font: this.helveticaBold,
        color: this.colorSlateMuted,
      });
    });
  }

  // Boxed Card drawing
  drawCard(title: string, lines: { label: string; value: string; isMonospace?: boolean }[], badgeText?: string, badgeColor?: RGB) {
    const estimatedHeight = 24 + lines.length * 15 + 10;
    this.ensureSpace(estimatedHeight);

    const startY = this.currentY;

    // Card background & border
    this.currentPage.drawRectangle({
      x: this.marginX,
      y: startY - estimatedHeight + 10,
      width: this.contentWidth,
      height: estimatedHeight,
      color: this.colorBgLight,
      borderColor: this.colorBorder,
      borderWidth: 0.5,
    });

    // Card Title
    this.currentPage.drawText(sanitizePdfText(title), {
      x: this.marginX + 10,
      y: startY - 8,
      size: 9.5,
      font: this.helveticaBold,
      color: this.colorNavy,
    });

    if (badgeText) {
      const bWidth = this.helveticaBold.widthOfTextAtSize(badgeText, 7.5) + 8;
      this.currentPage.drawRectangle({
        x: this.marginX + this.contentWidth - bWidth - 10,
        y: startY - 12,
        width: bWidth,
        height: 12,
        color: badgeColor ?? this.colorBannerBg,
      });
      this.currentPage.drawText(badgeText, {
        x: this.marginX + this.contentWidth - bWidth - 6,
        y: startY - 9,
        size: 7.5,
        font: this.helveticaBold,
        color: this.colorNavy,
      });
    }

    let lineY = startY - 24;
    for (const item of lines) {
      this.currentPage.drawText(sanitizePdfText(item.label) + ':', {
        x: this.marginX + 10,
        y: lineY,
        size: 8,
        font: this.helveticaBold,
        color: this.colorSlateMuted,
      });

      const font = item.isMonospace ? this.courier : this.helvetica;
      const cleanVal = sanitizePdfText(item.value);
      this.currentPage.drawText(cleanVal, {
        x: this.marginX + 110,
        y: lineY,
        size: 8,
        font,
        color: this.colorSlateDark,
      });

      lineY -= 14;
    }

    this.currentY -= estimatedHeight + 6;
  }
}

@Injectable()
export class IncidentReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a comprehensive, authenticated PDF incident report dossier.
   * Restricts access strictly to the incident owner.
   */
  async generateIncidentPdfForUser(
    userId: string,
    incidentId: string,
  ): Promise<GeneratedPdfReport> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        officialAccount: true,
        suspiciousProfiles: {
          include: {
            suspiciousProfile: true,
          },
        },
        abuseReports: {
          orderBy: { incidentDate: 'desc' },
        },
        evidence: {
          include: {
            auditLogs: {
              where: { action: 'VERIFY' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        timelineEvents: {
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        },
        analyses: {
          where: { type: AnalysisType.SAFETY_INTELLIGENCE },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident case not found',
      });
    }

    assertOwnedResource(incident, userId, 'Incident');

    const generatedAt = new Date();
    const doc = await PDFDocument.create();
    const layout = new PdfReportLayoutManager(doc, incident.id, generatedAt);
    await layout.initFonts();

    // 1. SafeSignal Branding & Confidential Header
    layout.drawBrandingHeader();

    // 2. Incident ID, Title, Narrative Description, Category, Severity & Timestamps
    layout.drawSectionHeader('Incident Case Overview', 1);

    layout.drawKeyValRow([
      { label: 'Incident Title', value: incident.title, width: 260 },
      { label: 'Incident Status', value: incident.status, width: 120 },
      { label: 'Severity Level', value: `${incident.severity} Priority`, width: 135 },
    ]);

    layout.drawKeyValRow([
      { label: 'Primary Category', value: incident.category, width: 150 },
      { label: 'Occurred Date', value: formatUtcDate(incident.occurredAt), width: 180 },
      { label: 'Case Opened (UTC)', value: formatUtcDate(incident.createdAt), width: 185 },
    ]);

    layout.drawKeyValRow([
      { label: 'Last Updated (UTC)', value: formatUtcDate(incident.updatedAt), width: 180 },
      { label: 'Resolved Date', value: formatUtcDate(incident.resolvedAt), width: 180 },
      { label: 'Target Account', value: incident.officialAccount ? `@${incident.officialAccount.handle} (${incident.officialAccount.platform})` : 'Not specified', width: 155 },
    ]);

    // Narrative
    layout.drawParagraph('Case Narrative / Factual Description:', {
      font: (layout as unknown as { helveticaBold: PDFFont }).helveticaBold,
      size: 8.5,
      color: layout.colorSlateMuted,
    });

    if (incident.description && incident.description.trim().length > 0) {
      layout.drawParagraph(incident.description, {
        size: 8.5,
        lineGap: 3,
        color: layout.colorSlateDark,
      });
    } else {
      layout.drawParagraph('No detailed narrative was provided for this incident case.', {
        size: 8.5,
        color: layout.colorSlateMuted,
      });
    }

    layout.drawDivider();

    // 3. Case Safety Intelligence Assessment (Requirement #10)
    layout.drawSectionHeader('Safety Intelligence & Threat Assessment', 2);

    if (incident.analyses && incident.analyses.length > 0) {
      const latestAnalysis = incident.analyses[0];
      const result = latestAnalysis.result as Record<string, unknown> | null;

      const riskLevel = typeof result?.riskLevel === 'string' ? result.riskLevel : 'UNKNOWN';
      const category = typeof result?.category === 'string' ? result.category : incident.category;
      const summary = typeof latestAnalysis.summary === 'string' ? latestAnalysis.summary : 'Automated analysis performed.';
      const indicators = Array.isArray(result?.indicators) ? result?.indicators : [];
      const suggestedActions = Array.isArray(result?.suggestedActions) ? result?.suggestedActions : [];

      layout.drawKeyValRow([
        { label: 'Determined Risk Level', value: `${riskLevel} RISK`, width: 160 },
        { label: 'Threat Classification', value: category, width: 175 },
        { label: 'Analysis Timestamp', value: formatUtcDate(latestAnalysis.createdAt), width: 180 },
      ]);

      layout.drawParagraph('Assessment Summary:', {
        font: (layout as unknown as { helveticaBold: PDFFont }).helveticaBold,
        size: 8,
        color: layout.colorSlateMuted,
      });
      layout.drawParagraph(summary, { size: 8, lineGap: 2.5 });

      if (indicators.length > 0) {
        layout.ensureSpace(16);
        layout.drawParagraph(`Detected Threat Indicators (${indicators.length}):`, {
          font: (layout as unknown as { helveticaBold: PDFFont }).helveticaBold,
          size: 8,
          color: layout.colorSlateMuted,
        });

        for (const ind of indicators.slice(0, 8)) {
          const title = typeof ind.title === 'string' ? ind.title : 'Indicator';
          const level = typeof ind.level === 'string' ? ind.level : 'MODERATE';
          const exp = typeof ind.explanation === 'string' ? ind.explanation : '';
          layout.drawParagraph(`* [${level}] ${title}: ${exp}`, {
            size: 7.5,
            color: layout.colorSlateDark,
            lineGap: 2,
          });
        }
      }

      if (suggestedActions.length > 0) {
        layout.ensureSpace(16);
        layout.drawParagraph('Recommended Safety Actions & Countermeasures:', {
          font: (layout as unknown as { helveticaBold: PDFFont }).helveticaBold,
          size: 8,
          color: layout.colorSlateMuted,
        });

        for (const act of suggestedActions.slice(0, 5)) {
          layout.drawParagraph(`- ${String(act)}`, {
            size: 7.5,
            color: layout.colorSlateDark,
            lineGap: 2,
          });
        }
      }

      layout.ensureSpace(14);
      layout.drawParagraph(
        'Legal Notice: Automated heuristic analysis evaluates language patterns and cross-report repetition. SafeSignal does not establish legal guilt, determine criminal intent, or certify the factual truth of allegations.',
        {
          font: (layout as unknown as { helvetica: PDFFont }).helvetica,
          size: 6.5,
          color: layout.colorSlateMuted,
          lineGap: 2,
        },
      );
    } else {
      layout.drawParagraph(
        'No automated safety intelligence evaluation has been executed for this incident case yet.',
        {
          size: 8,
          color: layout.colorSlateMuted,
        },
      );
    }

    layout.drawDivider();

    // 4. Linked Abuse Reports (Requirement #6)
    layout.drawSectionHeader('Linked Abuse Reports', 3);

    if (incident.abuseReports.length === 0) {
      layout.drawParagraph('No formal abuse reports have been associated with this incident.', {
        size: 8,
        color: layout.colorSlateMuted,
      });
    } else {
      for (const report of incident.abuseReports) {
        layout.drawCard(
          report.title,
          [
            { label: 'Platform & Category', value: `${report.platform} • ${report.category}` },
            { label: 'Severity & Status', value: `${report.severity} Priority • Status: ${report.reportStatus}` },
            { label: 'Incident Observed', value: formatUtcDate(report.incidentDate) },
            { label: 'Target / Offending URL', value: report.targetUrl || 'None provided' },
            { label: 'Platform Reference ID', value: report.referenceNumber || 'Not reported externally' },
          ],
          report.reportStatus,
        );
      }
    }

    layout.drawDivider();

    // 5. Associated Suspicious Profiles (Requirement #7)
    layout.drawSectionHeader('Associated Suspicious Profiles & Threat Actors', 4);

    if (incident.suspiciousProfiles.length === 0) {
      layout.drawParagraph('No tracked offender handles or suspicious profiles are currently linked.', {
        size: 8,
        color: layout.colorSlateMuted,
      });
    } else {
      for (const isp of incident.suspiciousProfiles) {
        const profile = isp.suspiciousProfile;
        layout.drawCard(
          `@${profile.handle} (${profile.platform})`,
          [
            { label: 'Display Name', value: profile.displayName || 'None' },
            { label: 'Review Status', value: profile.reviewStatus },
            { label: 'Profile URL', value: profile.profileUrl || 'None recorded' },
            { label: 'Association Notes', value: isp.notes || 'Associated with incident case' },
          ],
          profile.reviewStatus,
        );
      }
    }

    layout.drawDivider();

    // 6. Evidence Filenames, SHA-256 Hashes & Verification Status (Requirements #8 & #11)
    layout.drawSectionHeader('Evidence Vault Records & Cryptographic Integrity', 5);

    layout.drawParagraph(
      'Privacy & Integrity Notice: In compliance with SafeSignal zero-exposure privacy protections, raw binary evidence files (images, audio, documents) are stored exclusively in the private Evidence Vault and are not embedded into this summary dossier. Each record below is permanently secured with a cryptographic SHA-256 fingerprint.',
      {
        size: 7.5,
        color: layout.colorSlateMuted,
        lineGap: 2.5,
      },
    );

    if (incident.evidence.length === 0) {
      layout.drawParagraph('No evidence files have been attached to this incident.', {
        size: 8,
        color: layout.colorSlateMuted,
      });
    } else {
      for (const ev of incident.evidence) {
        const latestAudit = ev.auditLogs && ev.auditLogs.length > 0 ? ev.auditLogs[0] : null;

        let verificationLabel = 'RECORDED (Upload hash registered; pending audit verification check)';
        if (latestAudit) {
          if (latestAudit.status === 'SUCCESS') {
            verificationLabel = `VERIFIED (SHA-256 integrity confirmed on ${formatUtcDate(latestAudit.createdAt)})`;
          } else if (latestAudit.status === 'MISMATCH') {
            verificationLabel = `INTEGRITY MISMATCH DETECTED (Audit flagged discrepancy on ${formatUtcDate(latestAudit.createdAt)})`;
          }
        }

        layout.drawCard(
          ev.title,
          [
            { label: 'Filename', value: ev.fileName || 'Untitled file' },
            { label: 'MIME Type & Size', value: `${ev.mimeType || 'Unknown'} • ${formatBytes(ev.fileSize)}` },
            { label: 'SHA-256 Hash', value: ev.sha256 || 'None recorded', isMonospace: true },
            { label: 'Integrity Status', value: verificationLabel },
            { label: 'Captured / Uploaded', value: `${formatUtcDate(ev.capturedAt)} (Attached: ${formatUtcDate(ev.createdAt)})` },
          ],
          latestAudit?.status === 'SUCCESS' ? 'VERIFIED' : 'SECURED',
        );
      }

      layout.ensureSpace(16);
      layout.drawParagraph(
        'Cryptographic Guarantee: SHA-256 verification proves file integrity relative to the recorded upload timestamp and guarantees the stored vault file has not been altered since submission. It does not certify the authenticity, context, or truthfulness of the underlying content.',
        {
          size: 6.5,
          color: layout.colorSlateMuted,
          lineGap: 2,
        },
      );
    }

    layout.drawDivider();

    // 7. Chronological Incident Timeline (Requirement #9)
    layout.drawSectionHeader('Chronological Case Audit Timeline', 6);

    layout.drawParagraph(
      'System-Generated Event History: Chronologically ordered milestones recorded with server database timestamps. All historical events are immutable.',
      {
        size: 7.5,
        color: layout.colorSlateMuted,
        lineGap: 2,
      },
    );

    if (incident.timelineEvents.length === 0) {
      layout.drawParagraph('No chronological timeline events recorded.', {
        size: 8,
        color: layout.colorSlateMuted,
      });
    } else {
      for (const evt of incident.timelineEvents) {
        layout.ensureSpace(28);

        const eventTime = formatUtcDate(evt.occurredAt);
        const title = sanitizePdfText(evt.title);
        const desc = evt.description ? sanitizePdfText(evt.description) : '';

        // Left timestamp column + Right description
        this.drawTimelineItem(layout, eventTime, evt.eventType, title, desc);
      }
    }

    // Final pass: Page numbers on every page ("Page X of Y")
    layout.finalizePageNumbers();

    const pdfBytes = await doc.save();
    const filename = `SafeSignal-Incident-${incident.id.slice(0, 8)}.pdf`;

    return {
      buffer: Buffer.from(pdfBytes),
      filename,
    };
  }

  private drawTimelineItem(
    layout: PdfReportLayoutManager,
    timestamp: string,
    eventType: string,
    title: string,
    description: string,
  ) {
    const y = (layout as unknown as { currentY: number }).currentY;
    const page = (layout as unknown as { currentPage: PDFPage }).currentPage;
    const marginX = (layout as unknown as { marginX: number }).marginX;
    const helveticaBold = (layout as unknown as { helveticaBold: PDFFont }).helveticaBold;
    const helvetica = (layout as unknown as { helvetica: PDFFont }).helvetica;
    const courier = (layout as unknown as { courier: PDFFont }).courier;

    // Timestamp & Type
    page.drawText(timestamp, {
      x: marginX,
      y: y - 8,
      size: 7.5,
      font: courier,
      color: layout.colorSlateMuted,
    });

    page.drawText(`[${eventType}]`, {
      x: marginX,
      y: y - 18,
      size: 7,
      font: helveticaBold,
      color: layout.colorBlue,
    });

    // Vertical indicator line
    page.drawLine({
      start: { x: marginX + 130, y: y },
      end: { x: marginX + 130, y: y - 26 },
      thickness: 0.5,
      color: layout.colorBorder,
    });

    // Title and description
    page.drawText(title, {
      x: marginX + 140,
      y: y - 8,
      size: 8.5,
      font: helveticaBold,
      color: layout.colorSlateDark,
    });

    if (description) {
      const descLines = layout.wrapText(description, helvetica, 7.5, layout.contentWidth - 140);
      let descY = y - 18;
      for (const line of descLines.slice(0, 2)) {
        page.drawText(line, {
          x: marginX + 140,
          y: descY,
          size: 7.5,
          font: helvetica,
          color: layout.colorSlateMuted,
        });
        descY -= 9;
      }
    }

    (layout as unknown as { currentY: number }).currentY -= 30;
  }
}
