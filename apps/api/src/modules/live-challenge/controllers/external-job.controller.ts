import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../../../common/throttler/rate-limit.decorator.js';
import { RATE_LIMIT_POLICIES } from '../../../common/throttler/rate-limit.policies.js';
import { ExternalJobEventDto } from '../dto/external-job-event.dto/external-job-event.dto.js';
import { CompetitionExceptionFilter } from '../filters/competition-exception/competition-exception.filter.js';
import { ExternalSignatureGuard } from '../guards/external-signature/external-signature.guard.js';
import { ExternalJobIngestService } from '../services/external-job-ingest.service.js';

@Controller('integrations/job-events')
@UseGuards(ExternalSignatureGuard)
@UseFilters(CompetitionExceptionFilter)
@RateLimit(RATE_LIMIT_POLICIES.COMPETITION)
export class ExternalJobController {
  constructor(private readonly ingest: ExternalJobIngestService) {}

  @Post()
  @HttpCode(200)
  ingestEvent(@Body() dto: ExternalJobEventDto) {
    return this.ingest.ingest(dto);
  }
}
