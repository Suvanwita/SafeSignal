import { Module } from '@nestjs/common';
import { AbuseController } from './abuse.controller';
import { AbuseService } from './abuse.service';

@Module({
  controllers: [AbuseController],
  providers: [AbuseService],
  exports: [AbuseService],
})
export class AbuseModule {}
