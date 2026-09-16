import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ScopedThrottlerGuard } from './common/throttler/scoped-throttler.guard.js';
import {
  RATE_LIMIT_POLICIES,
  resolvePolicyLimits,
} from './common/throttler/rate-limit.policies.js';
import { ObservabilityModule } from './common/observability/observability.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { LiveChallengeModule } from './modules/live-challenge/live-challenge.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/.env for local; monorepo root .env for Compose / shared secrets
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: Object.values(RATE_LIMIT_POLICIES).map((policy) => ({
          name: policy,
          ...resolvePolicyLimits(config, policy),
        })),
      }),
    }),
    PrismaModule,
    ObservabilityModule,
    LiveChallengeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ScopedThrottlerGuard,
    },
  ],
})
export class AppModule {}
