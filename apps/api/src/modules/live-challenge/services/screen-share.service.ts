import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
import {
  CompetitionStatus,
  ParticipantStatus,
  UserRole,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuthUser } from '../../auth/auth.service.js';
import type { ScreenShareIntent } from '../dto/screen-share-token.dto/screen-share-token.dto.js';

const DEFAULT_TTL_SECONDS = 3600;
const MIN_TTL_SECONDS = 60;
const WEAK_LIVEKIT_SECRETS = new Set(['secret', 'devkey', 'change-me']);

export function screenShareRoomName(competitionId: string) {
  return `hirance-comp-${competitionId}`;
}

export function screenSharePublisherIdentity(userId: string) {
  return `publisher:${userId}`;
}

export function screenShareSubscriberIdentity(userId: string) {
  return `subscriber:${userId}`;
}

export function parseScreenSharePublisherUserId(identity: string) {
  return identity.startsWith('publisher:') ? identity.slice('publisher:'.length) : null;
}

@Injectable()
export class ScreenShareService {
  private readonly logger = new Logger(ScreenShareService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getStatus() {
    return { configured: this.isConfigured() };
  }

  isConfigured(): boolean {
    const cfg = this.readConfig();
    return Boolean(cfg);
  }

  async issueToken(
    competitionId: string,
    user: AuthUser,
    intent: ScreenShareIntent,
  ) {
    const livekit = this.requireConfig();
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException(`Competition ${competitionId} not found`);
    }
    if (competition.status !== CompetitionStatus.LIVE) {
      throw new ForbiddenException(
        'Screen sharing is only available while the competition is LIVE',
      );
    }

    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: user.id },
      },
    });

    const isAdmin = user.role === UserRole.ADMIN;
    if (!participant && !isAdmin) {
      throw new ForbiddenException(
        'Observer access requires an administrator or registered participant',
      );
    }

    if (intent === 'publish') {
      if (!participant) {
        throw new ForbiddenException('Only registered participants can share a screen');
      }
      if (participant.status === ParticipantStatus.DISQUALIFIED) {
        throw new ForbiddenException('Disqualified participants cannot share a screen');
      }
    }

    const ttlSeconds = this.tokenTtlSeconds(competition.endAt);
    const canPublish = intent === 'publish';
    const identity = canPublish
      ? screenSharePublisherIdentity(user.id)
      : screenShareSubscriberIdentity(user.id);
    const room = screenShareRoomName(competitionId);

    const token = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      name: user.name,
      ttl: ttlSeconds,
      metadata: JSON.stringify({
        userId: user.id,
        participantId: participant?.id ?? null,
        intent,
      }),
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: canPublish
        ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [],
    });

    const jwt = await token.toJwt();
    this.logger.log({
      event: 'screen_share_token_issued',
      competition_id: competitionId,
      user_id: user.id,
      intent,
      ttl_seconds: ttlSeconds,
    });

    return {
      configured: true,
      token: jwt,
      url: livekit.publicUrl,
      room,
      identity,
      intent,
      can_publish: canPublish,
      expires_in_seconds: ttlSeconds,
    };
  }

  async closeRoom(competitionId: string) {
    const livekit = this.readConfig();
    if (!livekit) {
      return;
    }
    try {
      const rooms = this.roomClient(livekit);
      await rooms.deleteRoom(screenShareRoomName(competitionId));
      this.logger.log({
        event: 'screen_share_room_closed',
        competition_id: competitionId,
      });
    } catch (error) {
      this.logger.warn({
        event: 'screen_share_room_close_failed',
        competition_id: competitionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async kickPublisher(competitionId: string, userId: string) {
    const livekit = this.readConfig();
    if (!livekit) {
      return;
    }
    try {
      const rooms = this.roomClient(livekit);
      await rooms.removeParticipant(
        screenShareRoomName(competitionId),
        screenSharePublisherIdentity(userId),
      );
      this.logger.log({
        event: 'screen_share_publisher_kicked',
        competition_id: competitionId,
        user_id: userId,
      });
    } catch (error) {
      this.logger.warn({
        event: 'screen_share_publisher_kick_failed',
        competition_id: competitionId,
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private tokenTtlSeconds(endAt: Date | null) {
    if (!endAt) {
      return DEFAULT_TTL_SECONDS;
    }
    const remaining = Math.ceil((endAt.getTime() - Date.now()) / 1000) + 30;
    return Math.max(MIN_TTL_SECONDS, Math.min(DEFAULT_TTL_SECONDS, remaining));
  }

  private requireConfig() {
    const cfg = this.readConfig();
    if (!cfg) {
      throw new ServiceUnavailableException('Screen share unavailable');
    }
    return cfg;
  }

  private readConfig() {
    const url = this.config.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET')?.trim();
    if (!url || !apiKey || !apiSecret) {
      return null;
    }
    if (
      WEAK_LIVEKIT_SECRETS.has(apiKey) &&
      this.config.get<string>('NODE_ENV') === 'production'
    ) {
      return null;
    }
    const publicUrl =
      this.config.get<string>('LIVEKIT_PUBLIC_URL')?.trim() || toWsUrl(url);
    return { url, apiKey, apiSecret, publicUrl };
  }

  private roomClient(cfg: {
    url: string;
    apiKey: string;
    apiSecret: string;
  }) {
    return new RoomServiceClient(toHttpUrl(cfg.url), cfg.apiKey, cfg.apiSecret);
  }
}

function toHttpUrl(url: string) {
  return url.replace(/^ws/i, 'http').replace(/\/$/, '');
}

function toWsUrl(url: string) {
  return url.replace(/^http/i, 'ws').replace(/\/$/, '');
}
