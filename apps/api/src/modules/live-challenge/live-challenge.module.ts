import { Module } from '@nestjs/common';
import { CompetitionController } from './controllers/competition.controller.js';
import { ExternalJobController } from './controllers/external-job.controller.js';
import { RoundController } from './controllers/round.controller.js';
import { CompetitionGateway } from './gateways/competition.gateway.js';
import { AdminKeyGuard } from './guards/admin-key/admin-key.guard.js';
import { EventKeyGuard } from './guards/event-key/event-key.guard.js';
import { ExternalSignatureGuard } from './guards/external-signature/external-signature.guard.js';
import { CompetitionAuditService } from './services/competition-audit.service.js';
import { CompetitionPresenceService } from './services/competition-presence.service.js';
import { CompetitionRealtimeService } from './services/competition-realtime.service.js';
import { CompetitionService } from './services/competition.service.js';
import { ExternalJobIngestService } from './services/external-job-ingest.service.js';
import { RoundLeaderboardService } from './services/round-leaderboard.service.js';
import { RoundLifecycleService } from './services/round-lifecycle.service.js';
import { RoundScoringService } from './services/round-scoring.service.js';
import { RoundService } from './services/round.service.js';
import { RoundTimerService } from './services/round-timer.service.js';
import { ScreenShareService } from './services/screen-share.service.js';

@Module({
  controllers: [
    CompetitionController,
    RoundController,
    ExternalJobController,
  ],
  providers: [
    // Services
    CompetitionService,
    RoundService,
    RoundLifecycleService,
    RoundScoringService,
    RoundLeaderboardService,
    RoundTimerService,
    CompetitionRealtimeService,
    CompetitionPresenceService,
    CompetitionAuditService,
    ExternalJobIngestService,
    ScreenShareService,
    // Gateway
    CompetitionGateway,
    // Guards (provided here so NestJS can inject ConfigService into them)
    AdminKeyGuard,
    EventKeyGuard,
    ExternalSignatureGuard,
  ],
  exports: [
    CompetitionService,
    RoundService,
    RoundTimerService,
    RoundScoringService,
    RoundLeaderboardService,
    CompetitionRealtimeService,
    CompetitionAuditService,
    ScreenShareService,
  ],
})
export class LiveChallengeModule {}
