import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AbuseService } from './abuse.service';

@ApiTags('Abuse')
@ApiBearerAuth('bearer')
@Controller('abuse')
export class AbuseController {
  constructor(private readonly abuseService: AbuseService) {}
}
