import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';

@ApiTags('Evidence')
@ApiBearerAuth('bearer')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}
}
