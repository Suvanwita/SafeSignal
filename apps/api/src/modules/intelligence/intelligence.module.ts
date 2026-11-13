import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { SafetyIntelligenceController } from './safety-intelligence.controller';
import { SafetyIntelligenceService } from './safety-intelligence.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IntelligenceController, SafetyIntelligenceController],
  providers: [IntelligenceService, SafetyIntelligenceService],
  exports: [IntelligenceService, SafetyIntelligenceService],
})
export class IntelligenceModule {}
