import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { VaultStorageService } from './vault-storage.service';

@Module({
  imports: [ConfigModule],
  controllers: [EvidenceController],
  providers: [EvidenceService, VaultStorageService],
  exports: [EvidenceService, VaultStorageService],
})
export class EvidenceModule {}
