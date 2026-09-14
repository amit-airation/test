import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  CompetitionEventType,
  ParticipantStatus,
  UserRole,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { AuthService } from '../../auth/auth.service.js';
import { resolveJwtSecret } from '../../../config/security.config.js';
import { COMPETITION_ROOMS } from '../constants.js';
import { JoinCompetitionWsDto } from '../dto/join-competition-ws.dto.js';
import { CLIENT_WS_ACTIONS, WS_EVENTS } from '../ws-events.js';
import { CompetitionAuditService } from '../services/competition-audit.service.js';
import { CompetitionPresenceService } from '../services/competition-presence.service.js';
import { CompetitionRealtimeService } from '../services/competition-realtime.service.js';
import { CompetitionTimerService } from '../services/competition-timer.service.js';
import { WsConnectionRateLimiterService } from '../services/ws-connection-rate-limiter.service.js';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';

type AuthedSocket = Socket & {
  data: {
    user?: AuthUser;
    competitionId?: string;
    participantId?: string;
  };
};

@SkipThrottle()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/competition',
})
export class CompetitionGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CompetitionGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly presence: CompetitionPresenceService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly timer: CompetitionTimerService,
    private readonly audit: CompetitionAuditService,
    private readonly connectionLimiter: WsConnectionRateLimiterService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  afterInit(server: Server) {
    // Namespace middleware runs before connection handlers / client emits.
    server.use(async (socket, next) => {
      if (!this.connectionLimiter.consume(this.handshakeKey(socket))) {
        next(new Error('Too many connection attempts'));
        return;
      }
      try {
        const user = await this.authenticateSocket(socket as AuthedSocket);
        (socket as AuthedSocket).data.user = user;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
    this.realtime.setServer(server);
    this.logger.log('Competition gateway initialized');
  }

  async handleConnection(client: AuthedSocket) {
    this.metrics.recordWebsocketConnected();
    this.logger.log({
      event: 'socket_connected',
      user_id: client.data.user?.id,
      socket_id: client.id,
    });
  }

  async handleDisconnect(client: AuthedSocket) {
    this.metrics.recordWebsocketDisconnected();
    const { competitionId, participantId, user } = client.data;
    if (competitionId && participantId) {
      const released = await this.presence.releaseSession(
        competitionId,
        participantId,
        client.id,
      );
      if (released) {
        await this.presence.markDisconnected(competitionId, participantId, {
          persistEvent: true,
        });
        this.realtime.emitPresence(
          competitionId,
          WS_EVENTS.PARTICIPANT_DISCONNECTED,
          {
            participant_id: participantId,
            user_id: user?.id,
          },
        );
      }
    }
    this.logger.log({
      event: 'socket_disconnected',
      user_id: user?.id,
      socket_id: client.id,
    });
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.JOIN_COMPETITION)
  async joinCompetition(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: JoinCompetitionWsDto,
  ) {
    try {
      const user = client.data.user;
      const competitionId =
        body?.competitionId ??
        (body as unknown as { data?: { competitionId?: string } })?.data
          ?.competitionId;
      if (!user) {
        return { ok: false, error: 'Unauthorized', received: body ?? null };
      }
      if (!competitionId) {
        return {
          ok: false,
          error: 'competitionId required',
          received: body ?? null,
        };
      }

      const competition = await this.prisma.competition.findUnique({
        where: { id: competitionId },
      });
      if (!competition) {
        return { ok: false, error: 'Competition not found' };
      }

      const participant = await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId,
            userId: user.id,
          },
        },
      });

      if (!participant && user.role !== UserRole.ADMIN) {
        return {
          ok: false,
          error:
            'Observer access requires an administrator or registered participant',
        };
      }

      const room = COMPETITION_ROOMS.competition(competitionId);
      await client.join(room);
      client.data.competitionId = competitionId;

      if (participant) {
        client.data.participantId = participant.id;

        const { supersededSocketId } = await this.presence.claimSession(
          competitionId,
          participant.id,
          client.id,
        );
        if (supersededSocketId) {
          await this.kickSupersededSocket(
            supersededSocketId,
            competitionId,
            participant.id,
          );
        }

        const { reconnected } = await this.presence.markConnected(
          competitionId,
          participant.id,
          user.id,
        );
        this.realtime.emitPresence(
          competitionId,
          WS_EVENTS.PARTICIPANT_CONNECTED,
          {
            participant_id: participant.id,
            user_id: user.id,
            name: user.name,
            reconnected,
          },
        );
      }

      const timer = this.timer.buildSnapshot(competition);
      client.emit(WS_EVENTS.COMPETITION_STATE, {
        event: WS_EVENTS.COMPETITION_STATE,
        competition_id: competition.id,
        status: competition.status,
        timer,
      });

      this.logger.log({
        event: 'socket_joined_competition',
        competition_id: competitionId,
        user_id: user.id,
        room,
      });
      this.metrics.recordWebsocketJoin(true);

      return {
        ok: true,
        room,
        status: competition.status,
        timer,
        participant_id: participant?.id ?? null,
      };
    } catch (error) {
      this.logger.error({
        event: 'socket_join_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.metrics.recordWebsocketJoin(false);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'join_failed',
      };
    }
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.LEAVE_COMPETITION)
  async leaveCompetition(@ConnectedSocket() client: AuthedSocket) {
    const { competitionId, participantId } = client.data;
    if (!competitionId) {
      return { ok: true };
    }

    await client.leave(COMPETITION_ROOMS.competition(competitionId));
    if (participantId) {
      await client.leave(
        COMPETITION_ROOMS.participant(competitionId, participantId),
      );
      const released = await this.presence.releaseSession(
        competitionId,
        participantId,
        client.id,
      );
      if (released) {
        await this.presence.markDisconnected(competitionId, participantId, {
          persistEvent: true,
        });
        this.realtime.emitPresence(
          competitionId,
          WS_EVENTS.PARTICIPANT_DISCONNECTED,
          { participant_id: participantId, user_id: client.data.user?.id },
        );
      }
    }
    client.data.competitionId = undefined;
    client.data.participantId = undefined;
    return { ok: true };
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.JOIN_PARTICIPANT_ROOM)
  async joinParticipantRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { competitionId?: string; participantId?: string },
  ) {
    const user = client.data.user;
    if (!user || !body?.competitionId || !body?.participantId) {
      return { ok: false, error: 'competitionId and participantId required' };
    }

    const participant = await this.prisma.competitionParticipant.findUnique({
      where: { id: body.participantId },
    });
    if (!participant || participant.competitionId !== body.competitionId) {
      return { ok: false, error: 'Participant not found' };
    }

    // Private rooms: only the owning participant or an admin.
    if (participant.userId !== user.id && user.role !== UserRole.ADMIN) {
      return { ok: false, error: 'Forbidden' };
    }

    const room = COMPETITION_ROOMS.participant(
      body.competitionId,
      body.participantId,
    );
    await client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.HEARTBEAT)
  async heartbeat(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { competitionId?: string },
  ) {
    const competitionId = body?.competitionId ?? client.data.competitionId;
    const participantId = client.data.participantId;
    if (!competitionId || !participantId) {
      return { ok: false, error: 'Not joined as participant' };
    }

    await this.presence.heartbeat(competitionId, participantId);
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    return {
      ok: true,
      timer: competition ? this.timer.buildSnapshot(competition) : null,
    };
  }

  /**
   * Optional integrity signal (spec §35). Client-reported and therefore never
   * authoritative — it is only recorded for dispute review.
   */
  @SubscribeMessage(CLIENT_WS_ACTIONS.REPORT_SCREEN_SHARE)
  async reportScreenShare(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { sharing?: boolean },
  ) {
    const { competitionId, participantId } = client.data;
    if (!competitionId || !participantId) {
      return { ok: false, error: 'Not joined as participant' };
    }

    const participant = await this.prisma.competitionParticipant.findUnique({
      where: { id: participantId },
      select: { status: true },
    });
    if (participant?.status === ParticipantStatus.DISQUALIFIED) {
      return { ok: false, error: 'Participant is disqualified' };
    }

    await this.audit.record({
      competitionId,
      participantId,
      eventType: body?.sharing
        ? CompetitionEventType.SCREEN_SHARE_STARTED
        : CompetitionEventType.SCREEN_SHARE_STOPPED,
    });

    return { ok: true };
  }

  private handshakeKey(socket: Socket): string {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first?.split(',')[0].trim() || socket.handshake.address;
  }

  /**
   * One active competition session per participant (details.md §56).
   * The older tab receives SESSION_SUPERSEDED and is disconnected.
   */
  private async kickSupersededSocket(
    socketId: string,
    competitionId: string,
    participantId: string,
  ) {
    // Nest injects the `/competition` Namespace here (typed as Server).
    const namespaceSockets = (
      this.server as unknown as { sockets: Map<string, AuthedSocket> }
    ).sockets;
    const older = namespaceSockets.get(socketId);
    if (!older) {
      return;
    }
    older.emit(WS_EVENTS.SESSION_SUPERSEDED, {
      event: WS_EVENTS.SESSION_SUPERSEDED,
      competition_id: competitionId,
      participant_id: participantId,
      reason: 'another_session_joined',
    });
    // Clear session ownership on the older socket so its disconnect handler
    // does not release the newer claim or write a false DISCONNECTED audit.
    older.data.competitionId = undefined;
    older.data.participantId = undefined;
    older.disconnect(true);
  }

  private async authenticateSocket(client: AuthedSocket): Promise<AuthUser> {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (typeof client.handshake.headers.authorization === 'string'
        ? client.handshake.headers.authorization
        : undefined);

    if (!raw) {
      throw new Error('Missing token');
    }

    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
      secret: resolveJwtSecret(this.config),
    });
    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}
