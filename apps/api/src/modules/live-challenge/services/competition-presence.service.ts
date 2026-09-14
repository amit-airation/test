import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompetitionAuditService } from './competition-audit.service.js';

const PRESENCE_TTL_SECONDS = 45;
const SESSION_TTL_SECONDS = 60 * 60;

/**
 * Presence + single-active-session enforcement (details.md §56).
 * Redis is ephemeral only — disconnect audits still land in PostgreSQL.
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
      // Presence is ephemeral — never block scoring on a Redis backlog.
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

  /**
   * Atomically swaps the active socket id and returns the previous owner.
   * Keeps session claims race-safe under concurrent tab joins.
   */
  private async swapSessionOwner(key: string, socketId: string) {
    return this.redis.eval(
      `
      local previous = redis.call('GET', KEYS[1])
      redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
      return previous
      `,
      1,
      key,
      socketId,
      String(SESSION_TTL_SECONDS),
    ) as Promise<string | null>;
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  private presenceKey(competitionId: string, participantId: string) {
    return `presence:${competitionId}:${participantId}`;
  }

  private sessionKey(competitionId: string, participantId: string) {
    return `session:${competitionId}:${participantId}`;
  }

  /**
   * Claims the single active competition socket for this participant.
   * Returns any previously owning socket id so the gateway can kick it.
   */
  async claimSession(
    competitionId: string,
    participantId: string,
    socketId: string,
  ): Promise<{ supersededSocketId: string | null }> {
    const key = this.sessionKey(competitionId, participantId);
    try {
      const previous = await this.swapSessionOwner(key, socketId);
      if (previous && previous !== socketId) {
        this.logger.log({
          event: 'session_superseded',
          competition_id: competitionId,
          participant_id: participantId,
          previous_socket_id: previous,
          socket_id: socketId,
        });
        return { supersededSocketId: previous };
      }
      return { supersededSocketId: null };
    } catch (error) {
      this.logger.warn({
        event: 'session_claim_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail open for presence infra — scoring remains authoritative in Postgres.
      return { supersededSocketId: null };
    }
  }

  /**
   * Releases the session only if this socket still owns it. Prevents a
   * kicked tab's disconnect from clearing the newer active session.
   */
  async releaseSession(
    competitionId: string,
    participantId: string,
    socketId: string,
  ): Promise<boolean> {
    const key = this.sessionKey(competitionId, participantId);
    try {
      const current = await this.redis.get(key);
      if (current && current !== socketId) {
        return false;
      }
      if (current === socketId) {
        await this.redis.del(key);
      }
      return true;
    } catch (error) {
      this.logger.warn({
        event: 'session_release_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  /**
   * Records presence for a participant socket. Returns whether this was a
   * reconnect, which is audited so disputes can distinguish a first join from
   * a mid-competition drop and recovery.
   */
  async markConnected(
    competitionId: string,
    participantId: string,
    userId: string,
  ): Promise<{ reconnected: boolean }> {
    const wasConnected = await this.isConnected(competitionId, participantId);

    try {
      await this.redis.set(
        this.presenceKey(competitionId, participantId),
        JSON.stringify({
          userId,
          connectedAt: new Date().toISOString(),
        }),
        'EX',
        PRESENCE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({
        event: 'presence_mark_connected_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.prisma.competitionParticipant.update({
      where: { id: participantId },
      data: { lastHeartbeatAt: new Date() },
    });

    const reconnected =
      !wasConnected && (await this.lastPresenceEventWasDisconnect(participantId));

    if (reconnected) {
      await this.audit.record({
        competitionId,
        participantId,
        eventType: CompetitionEventType.RECONNECTED,
        metadata: { userId },
      });
    }

    return { reconnected };
  }

  private async lastPresenceEventWasDisconnect(participantId: string) {
    const last = await this.prisma.competitionEvent.findFirst({
      where: {
        participantId,
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

  async heartbeat(competitionId: string, participantId: string) {
    try {
      const key = this.presenceKey(competitionId, participantId);
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
        this.sessionKey(competitionId, participantId),
        SESSION_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({
        event: 'presence_heartbeat_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.prisma.competitionParticipant.update({
      where: { id: participantId },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async markDisconnected(
    competitionId: string,
    participantId: string,
    options?: { persistEvent?: boolean },
  ) {
    try {
      await this.redis.del(this.presenceKey(competitionId, participantId));
    } catch (error) {
      this.logger.warn({
        event: 'presence_mark_disconnected_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (options?.persistEvent) {
      await this.audit.record({
        competitionId,
        participantId,
        eventType: CompetitionEventType.DISCONNECTED,
      });
    }
  }

  async isConnected(competitionId: string, participantId: string) {
    try {
      return (
        (await this.redis.exists(
          this.presenceKey(competitionId, participantId),
        )) === 1
      );
    } catch {
      return false;
    }
  }
}
