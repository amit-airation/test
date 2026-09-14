import { Global, Module } from '@nestjs/common';
import { CompetitionMetricsService } from './competition-metrics.service.js';
import { HealthController } from './health.controller.js';
import { ReadinessService } from './readiness.service.js';

@Global()
@Module({
  controllers: [HealthController],
  providers: [CompetitionMetricsService, ReadinessService],
  exports: [CompetitionMetricsService, ReadinessService],
})
export class ObservabilityModule {}
