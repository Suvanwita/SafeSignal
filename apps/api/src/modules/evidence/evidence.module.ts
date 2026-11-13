import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService } from '../../common';
import { AuthModule } from '../auth/auth.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { VaultStorageService } from './vault-storage.service';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [EvidenceController],
  providers: [EvidenceService, VaultStorageService, EncryptionService],
  exports: [EvidenceService, VaultStorageService, EncryptionService],
})
export class EvidenceModule {}
