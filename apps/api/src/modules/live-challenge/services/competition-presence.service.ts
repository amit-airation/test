import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompetitionAuditService } from './competition-audit.service.js';

const PRESENCE_TTL_SECONDS = 45;
const SESSION_TTL_SECONDS = 60 * 60;

/**
 * Redis-backed presence and single-active-session enforcement.
 * Keyed by round + participant so each round has independent sessions.
 */
@Injectable()
export class CompetitionPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(CompetitionPresenceService.name);
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: CompetitionAuditService,
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
    void this.redis.connect().catch((error: unknown) => {
      this.logger.warn({
        event: 'presence_redis_connect_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  private presenceKey(roundId: string, participantId: string) {
    return `presence:round:${roundId}:${participantId}`;
  }

  private sessionKey(roundId: string, participantId: string) {
    return `session:round:${roundId}:${participantId}`;
  }

  private async swapSessionOwner(key: string, socketId: string) {
    return this.redis.eval(
      `local p = redis.call('GET', KEYS[1])
       redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
       return p`,
      1,
      key,
      socketId,
      String(SESSION_TTL_SECONDS),
    ) as Promise<string | null>;
  }

  /** Atomically claims this round's session for a socket; returns the previous owner. */
  async claimSession(
    roundId: string,
    participantId: string,
    socketId: string,
  ): Promise<{ supersededSocketId: string | null }> {
    const key = this.sessionKey(roundId, participantId);
    try {
      const previous = await this.swapSessionOwner(key, socketId);
      if (previous && previous !== socketId) {
        return { supersededSocketId: previous };
      }
      return { supersededSocketId: null };
    } catch (error) {
      this.logger.warn({
        event: 'session_claim_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return { supersededSocketId: null };
    }
  }

  async releaseSession(
    roundId: string,
    participantId: string,
    socketId: string,
  ): Promise<boolean> {
    const key = this.sessionKey(roundId, participantId);
    try {
      const current = await this.redis.get(key);
      if (current && current !== socketId) return false;
      if (current === socketId) await this.redis.del(key);
      return true;
    } catch {
      return true;
    }
  }

  async markConnected(
    competitionId: string,
    roundId: string,
    participantId: string,
    companyId: string,
  ): Promise<{ reconnected: boolean }> {
    const wasConnected = await this.isConnected(roundId, participantId);

    try {
      await this.redis.set(
        this.presenceKey(roundId, participantId),
        JSON.stringify({ companyId, connectedAt: new Date().toISOString() }),
        'EX',
        PRESENCE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({
        event: 'presence_mark_connected_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.prisma.roundParticipant.update({
      where: { id: participantId },
      data: { lastHeartbeatAt: new Date() },
    });

    const reconnected =
      !wasConnected &&
      (await this.lastPresenceEventWasDisconnect(competitionId, participantId));

    if (reconnected) {
      await this.audit.record({
        competitionId,
        roundId,
        roundParticipantId: participantId,
        eventType: CompetitionEventType.RECONNECTED,
        metadata: { companyId },
      });
    }

    return { reconnected };
  }

  private async lastPresenceEventWasDisconnect(
    competitionId: string,
    participantId: string,
  ) {
    const last = await this.prisma.competitionEvent.findFirst({
      where: {
        competitionId,
        roundParticipantId: participantId,
        eventType: {
          in: [
            CompetitionEventType.JOINED,
            CompetitionEventType.DISCONNECTED,
            CompetitionEventType.RECONNECTED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { eventType: true },
    });
    return last?.eventType === CompetitionEventType.DISCONNECTED;
  }

  async heartbeat(roundId: string, participantId: string) {
    try {
      const key = this.presenceKey(roundId, participantId);
      const exists = await this.redis.exists(key);
      if (exists) {
        await this.redis.expire(key, PRESENCE_TTL_SECONDS);
      } else {
        await this.redis.set(
          key,
          JSON.stringify({ reconnectedAt: new Date().toISOString() }),
          'EX',
          PRESENCE_TTL_SECONDS,
        );
      }
      await this.redis.expire(
        this.sessionKey(roundId, participantId),
        SESSION_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({
        event: 'presence_heartbeat_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.prisma.roundParticipant.update({
      where: { id: participantId },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async markDisconnected(
    competitionId: string,
    roundId: string,
    participantId: string,
    options?: { persistEvent?: boolean },
  ) {
    try {
      await this.redis.del(this.presenceKey(roundId, participantId));
    } catch (error) {
      this.logger.warn({
        event: 'presence_mark_disconnected_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (options?.persistEvent) {
      await this.audit.record({
        competitionId,
        roundId,
        roundParticipantId: participantId,
        eventType: CompetitionEventType.DISCONNECTED,
      });
    }
  }

  async isConnected(roundId: string, participantId: string) {
    try {
      return (
        (await this.redis.exists(this.presenceKey(roundId, participantId))) === 1
      );
    } catch {
      return false;
    }
  }
}
