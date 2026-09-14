import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service.js';

export type DependencyCheck = {
  name: string;
  status: 'up' | 'down';
  latency_ms: number;
  error?: string;
};

@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadinessService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string | number>('REDIS_PORT', 6379)),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  async check(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    checks: DependencyCheck[];
  }> {
    const checks = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);

    const postgres = checks.find((c) => c.name === 'postgres');
    const redis = checks.find((c) => c.name === 'redis');

    // Postgres is authoritative — down means not ready.
    // Redis is ephemeral — degraded is acceptable for scoring.
    let status: 'ok' | 'degraded' | 'down' = 'ok';
    if (postgres?.status === 'down') status = 'down';
    else if (redis?.status === 'down') status = 'degraded';

    return { status, checks };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: 'postgres',
        status: 'up',
        latency_ms: Date.now() - started,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ event: 'readiness_postgres_down', error: message });
      return {
        name: 'postgres',
        status: 'down',
        latency_ms: Date.now() - started,
        error: message,
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`unexpected ping reply: ${pong}`);
      }
      return {
        name: 'redis',
        status: 'up',
        latency_ms: Date.now() - started,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ event: 'readiness_redis_down', error: message });
      return {
        name: 'redis',
        status: 'down',
        latency_ms: Date.now() - started,
        error: message,
      };
    }
  }
}
