import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CompetitionController } from './controllers/competition.controller.js';
import { ExternalJobController } from './controllers/external-job.controller.js';
import { CompetitionGateway } from './gateways/competition.gateway.js';
import { CompetitionAdminGuard } from './guards/competition-admin/competition-admin.guard.js';
import { CompetitionObserverGuard } from './guards/competition-observer/competition-observer.guard.js';
import { CompetitionParticipantGuard } from './guards/competition-participant/competition-participant.guard.js';
import { ExternalSignatureGuard } from './guards/external-signature/external-signature.guard.js';
import { CompetitionLeaderboardService } from './services/competition-leaderboard.service.js';
import { CompetitionLifecycleService } from './services/competition-lifecycle.service.js';
import { CompetitionPresenceService } from './services/competition-presence.service.js';
import { CompetitionRealtimeService } from './services/competition-realtime.service.js';
import { CompetitionScoringService } from './services/competition-scoring.service.js';
import { CompetitionTimerService } from './services/competition-timer.service.js';
import { CompetitionService } from './services/competition.service.js';
import { CompetitionAuditService } from './services/competition-audit.service.js';
import { ExternalJobIngestService } from './services/external-job-ingest.service.js';
import { ScreenShareService } from './services/screen-share.service.js';
import { WsConnectionRateLimiterService } from './services/ws-connection-rate-limiter.service.js';
import { CompetitionJobValidator } from './validators/competition-job.validator/competition-job.validator.js';

@Module({
  imports: [AuthModule],
  controllers: [CompetitionController, ExternalJobController],
  providers: [
    CompetitionService,
    CompetitionLifecycleService,
    CompetitionScoringService,
    CompetitionLeaderboardService,
    CompetitionTimerService,
    CompetitionRealtimeService,
    CompetitionPresenceService,
    CompetitionJobValidator,
    CompetitionGateway,
    CompetitionAdminGuard,
    CompetitionParticipantGuard,
    CompetitionObserverGuard,
    ExternalSignatureGuard,
    ExternalJobIngestService,
    CompetitionAuditService,
    WsConnectionRateLimiterService,
    ScreenShareService,
  ],
  exports: [
    CompetitionService,
    CompetitionLifecycleService,
    CompetitionTimerService,
    CompetitionScoringService,
    CompetitionLeaderboardService,
    CompetitionRealtimeService,
    CompetitionJobValidator,
    CompetitionAuditService,
    ScreenShareService,
  ],
})
export class LiveChallengeModule {}
