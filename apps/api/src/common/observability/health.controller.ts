import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { CompetitionMetricsService } from './competition-metrics.service.js';
import { ReadinessService } from './readiness.service.js';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  @Get('health/live')
  live() {
    return { status: 'ok', service: 'hirance-api' };
  }

  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.readiness.check();
    if (result.status === 'down') {
      res.status(503);
    } else if (result.status === 'degraded') {
      res.status(200);
    }
    return {
      status: result.status,
      service: 'hirance-api',
      checks: result.checks,
    };
  }

  @Get('metrics')
  metricsSnapshot() {
    return {
      service: 'hirance-api',
      ...this.metrics.snapshot(),
    };
  }
}
