import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';

@ApiTags('Identity')
@ApiBearerAuth('bearer')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}
}
