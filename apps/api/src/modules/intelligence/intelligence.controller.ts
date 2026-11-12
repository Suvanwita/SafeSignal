import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';

@ApiTags('Intelligence')
@ApiBearerAuth('bearer')
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}
}
