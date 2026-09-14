import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
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
import { AuthModule } from './modules/auth/auth.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
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
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    ObservabilityModule,
    AuthModule,
    CompaniesModule,
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
