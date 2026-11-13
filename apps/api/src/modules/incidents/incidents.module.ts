import { Module } from '@nestjs/common';
import { IncidentReportPdfService } from './incident-report-pdf.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentReportPdfService],
  exports: [IncidentsService, IncidentReportPdfService],
})
export class IncidentsModule {}
