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
  ParticipantStatus,
  RoundStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { ScreenShareIntent } from '../dto/screen-share-token.dto/screen-share-token.dto.js';

const DEFAULT_TTL_SECONDS = 3600;
const MIN_TTL_SECONDS = 60;
const WEAK_LIVEKIT_SECRETS = new Set(['secret', 'devkey', 'change-me']);

export function screenShareRoomName(roundId: string) {
  return `hirance-round-${roundId}`;
}

export function screenSharePublisherIdentity(companyId: string) {
  return `publisher:${companyId}`;
}

export function screenShareSubscriberIdentity(companyId: string) {
  return `subscriber:${companyId}`;
}

export function parseScreenSharePublisherCompanyId(identity: string) {
  return identity.startsWith('publisher:')
    ? identity.slice('publisher:'.length)
    : null;
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
    return Boolean(this.readConfig());
  }

  async issueToken(
    roundId: string,
    companyId: string | null,
    companyName: string,
    intent: ScreenShareIntent,
  ) {
    const livekit = this.requireConfig();

    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });
    if (!round) throw new NotFoundException(`Round ${roundId} not found`);

    if (round.status !== RoundStatus.LIVE) {
      throw new ForbiddenException(
        'Screen sharing is only available while the round is LIVE',
      );
    }

    // Participants need a valid non-disqualified record; observers (null companyId) can always watch
    if (intent === 'publish') {
      if (!companyId) {
        throw new ForbiddenException(
          'Only registered participants can share a screen',
        );
      }
      const participant = await this.prisma.roundParticipant.findUnique({
        where: { roundId_companyId: { roundId, companyId } },
        include: { company: { select: { name: true } } },
      });
      if (!participant) {
        throw new ForbiddenException(
          'You are not registered for this round',
        );
      }
      if (participant.status === ParticipantStatus.DISQUALIFIED) {
        throw new ForbiddenException(
          'Disqualified participants cannot share a screen',
        );
      }
      // Prefer stored company name when caller didn't pass one
      if (!companyName || companyName === 'Observer') {
        companyName = participant.company.name;
      }
    }

    const ttlSeconds = this.tokenTtlSeconds(round.endAt);
    const canPublish = intent === 'publish';
    const identityBase = companyId ?? `observer-${Date.now()}`;
    const identity = canPublish
      ? screenSharePublisherIdentity(identityBase)
      : screenShareSubscriberIdentity(identityBase);
    const room = screenShareRoomName(roundId);

    const token = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      name: companyName,
      ttl: ttlSeconds,
      metadata: JSON.stringify({ companyId, roundId, intent }),
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
      round_id: roundId,
      company_id: companyId,
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

  async closeRoom(roundId: string) {
    const livekit = this.readConfig();
    if (!livekit) return;
    try {
      const rooms = this.roomClient(livekit);
      await rooms.deleteRoom(screenShareRoomName(roundId));
      this.logger.log({ event: 'screen_share_room_closed', round_id: roundId });
    } catch (error) {
      this.logger.warn({
        event: 'screen_share_room_close_failed',
        round_id: roundId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async kickPublisher(roundId: string, companyId: string) {
    const livekit = this.readConfig();
    if (!livekit) return;
    try {
      const rooms = this.roomClient(livekit);
      await rooms.removeParticipant(
        screenShareRoomName(roundId),
        screenSharePublisherIdentity(companyId),
      );
      this.logger.log({
        event: 'screen_share_publisher_kicked',
        round_id: roundId,
        company_id: companyId,
      });
    } catch (error) {
      this.logger.warn({
        event: 'screen_share_publisher_kick_failed',
        round_id: roundId,
        company_id: companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private tokenTtlSeconds(endAt: Date | null) {
    if (!endAt) return DEFAULT_TTL_SECONDS;
    const remaining = Math.ceil((endAt.getTime() - Date.now()) / 1_000) + 30;
    return Math.max(MIN_TTL_SECONDS, Math.min(DEFAULT_TTL_SECONDS, remaining));
  }

  private requireConfig() {
    const cfg = this.readConfig();
    if (!cfg) throw new ServiceUnavailableException('Screen share unavailable');
    return cfg;
  }

  private readConfig() {
    const url = this.config.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET')?.trim();
    if (!url || !apiKey || !apiSecret) return null;
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
    return new RoomServiceClient(
      toHttpUrl(cfg.url),
      cfg.apiKey,
      cfg.apiSecret,
    );
  }
}

function toHttpUrl(url: string) {
  return url.replace(/^ws/i, 'http').replace(/\/$/, '');
}

function toWsUrl(url: string) {
  return url.replace(/^http/i, 'ws').replace(/\/$/, '');
}
