import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { timingSafeEqual } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { COMPETITION_ROOMS } from '../constants.js';
import { JoinCompetitionWsDto, JoinRoundWsDto } from '../dto/join-competition-ws.dto.js';
import { CLIENT_WS_ACTIONS, WS_EVENTS } from '../ws-events.js';
import { CompetitionAuditService } from '../services/competition-audit.service.js';
import { CompetitionPresenceService } from '../services/competition-presence.service.js';
import { CompetitionRealtimeService } from '../services/competition-realtime.service.js';
import { RoundTimerService } from '../services/round-timer.service.js';

type SocketIdentity = {
  companyId?: string;
  displayName?: string;
  isAdmin: boolean;
};

type AuthedSocket = Socket & {
  data: {
    identity?: SocketIdentity;
    competitionId?: string;
    roundId?: string;
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
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: CompetitionPresenceService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly timer: RoundTimerService,
    private readonly audit: CompetitionAuditService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const provided =
        (socket.handshake.auth as Record<string, string>)?.eventKey?.trim() ??
        (socket.handshake.headers['x-event-key'] as string | undefined)?.trim();

      const eventKey = this.config.get<string>('EVENT_ACCESS_KEY', '').trim();
      const adminKey = this.config.get<string>('ADMIN_KEY', '').trim();

      const isEventKey = this.keysMatch(eventKey, provided ?? '');
      const isAdminKey = adminKey.length > 0 && this.keysMatch(adminKey, provided ?? '');

      if (!isEventKey && !isAdminKey) {
        next(new Error('Unauthorized'));
        return;
      }

      (socket as AuthedSocket).data.identity = {
        isAdmin: isAdminKey,
      };
      next();
    });

    this.realtime.setServer(server);
    this.logger.log('Competition gateway initialized');
  }

  handleConnection(client: AuthedSocket) {
    this.metrics.recordWebsocketConnected();
    this.logger.log({
      event: 'socket_connected',
      socket_id: client.id,
    });
  }

  async handleDisconnect(client: AuthedSocket) {
    this.metrics.recordWebsocketDisconnected();
    const { competitionId, roundId, participantId } = client.data;

    if (competitionId && roundId && participantId) {
      const released = await this.presence.releaseSession(
        roundId,
        participantId,
        client.id,
      );
      if (released) {
        await this.presence.markDisconnected(
          competitionId,
          roundId,
          participantId,
          { persistEvent: true },
        );
        this.realtime.emitPresence(
          competitionId,
          WS_EVENTS.PARTICIPANT_DISCONNECTED,
          {
            round_id: roundId,
            participant_id: participantId,
            company_id: client.data.identity?.companyId,
          },
        );
      }
    }

    this.logger.log({ event: 'socket_disconnected', socket_id: client.id });
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.JOIN_COMPETITION)
  async joinCompetition(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: JoinCompetitionWsDto,
  ) {
    try {
      const competitionId =
        body?.competitionId ??
        (body as unknown as { data?: { competitionId?: string } })?.data
          ?.competitionId;

      if (!competitionId) {
        return { ok: false, error: 'competitionId required' };
      }

      const competition = await this.prisma.competition.findUnique({
        where: { id: competitionId },
        include: {
          rounds: { orderBy: { roundNumber: 'asc' } },
          activeRound: true,
        },
      });
      if (!competition) return { ok: false, error: 'Competition not found' };

      const room = COMPETITION_ROOMS.competition(competitionId);
      await client.join(room);
      client.data.competitionId = competitionId;

      if (body.companyId) {
        client.data.identity = {
          ...client.data.identity,
          isAdmin: client.data.identity?.isAdmin ?? false,
          companyId: body.companyId,
          displayName: body.displayName,
        };
      }

      const timer = competition.activeRound
        ? this.timer.buildSnapshot(competition.activeRound)
        : null;

      client.emit(WS_EVENTS.COMPETITION_STATE, {
        event: WS_EVENTS.COMPETITION_STATE,
        competition_id: competition.id,
        status: competition.status,
        active_round_id: competition.activeRoundId,
        round: competition.activeRound
          ? {
              id: competition.activeRound.id,
              name: competition.activeRound.name,
              round_number: competition.activeRound.roundNumber,
              status: competition.activeRound.status,
              timer,
            }
          : null,
        rounds: competition.rounds.map((r) => ({
          id: r.id,
          round_number: r.roundNumber,
          name: r.name,
          status: r.status,
        })),
      });

      this.metrics.recordWebsocketJoin(true);
      return {
        ok: true,
        room,
        status: competition.status,
        active_round_id: competition.activeRoundId,
      };
    } catch (error) {
      this.metrics.recordWebsocketJoin(false);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'join_failed',
      };
    }
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.LEAVE_COMPETITION)
  async leaveCompetition(@ConnectedSocket() client: AuthedSocket) {
    const { competitionId } = client.data;
    if (!competitionId) return { ok: true };

    await client.leave(COMPETITION_ROOMS.competition(competitionId));
    client.data.competitionId = undefined;
    return { ok: true };
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.JOIN_ROUND)
  async joinRound(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: JoinRoundWsDto,
  ) {
    try {
      const { competitionId, roundId, companyId } = body;

      const round = await this.prisma.round.findUnique({
        where: { id: roundId },
      });
      if (!round || round.competitionId !== competitionId) {
        return { ok: false, error: 'Round not found' };
      }

      const roundRoom = COMPETITION_ROOMS.round(roundId);
      await client.join(roundRoom);
      client.data.roundId = roundId;

      if (companyId) {
        const participant = await this.prisma.roundParticipant.findUnique({
          where: { roundId_companyId: { roundId, companyId } },
        });

        if (participant) {
          client.data.participantId = participant.id;
          client.data.identity = {
            ...client.data.identity,
            isAdmin: client.data.identity?.isAdmin ?? false,
            companyId,
          };

          const { supersededSocketId } = await this.presence.claimSession(
            roundId,
            participant.id,
            client.id,
          );
          if (supersededSocketId) {
            this.kickSupersededSocket(supersededSocketId, competitionId, participant.id);
          }

          const { reconnected } = await this.presence.markConnected(
            competitionId,
            roundId,
            participant.id,
            companyId,
          );

          this.realtime.emitPresence(
            competitionId,
            WS_EVENTS.PARTICIPANT_CONNECTED,
            {
              round_id: roundId,
              participant_id: participant.id,
              company_id: companyId,
              display_name: participant.displayName,
              reconnected,
            },
          );
        }
      }

      const timer = this.timer.buildSnapshot(round);
      return { ok: true, room: roundRoom, status: round.status, timer };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'join_round_failed',
      };
    }
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.LEAVE_ROUND)
  async leaveRound(@ConnectedSocket() client: AuthedSocket) {
    const { competitionId, roundId, participantId } = client.data;
    if (!roundId) return { ok: true };

    await client.leave(COMPETITION_ROOMS.round(roundId));

    if (competitionId && roundId && participantId) {
      const released = await this.presence.releaseSession(
        roundId,
        participantId,
        client.id,
      );
      if (released) {
        await this.presence.markDisconnected(
          competitionId,
          roundId,
          participantId,
          { persistEvent: true },
        );
        this.realtime.emitPresence(
          competitionId,
          WS_EVENTS.PARTICIPANT_DISCONNECTED,
          {
            round_id: roundId,
            participant_id: participantId,
            company_id: client.data.identity?.companyId,
          },
        );
      }
    }

    client.data.roundId = undefined;
    client.data.participantId = undefined;
    return { ok: true };
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.HEARTBEAT)
  async heartbeat(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roundId?: string },
  ) {
    const roundId = body?.roundId ?? client.data.roundId;
    const participantId = client.data.participantId;

    if (!roundId || !participantId) {
      return { ok: false, error: 'Not joined as participant' };
    }

    await this.presence.heartbeat(roundId, participantId);
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    return { ok: true, timer: round ? this.timer.buildSnapshot(round) : null };
  }

  @SubscribeMessage(CLIENT_WS_ACTIONS.REPORT_SCREEN_SHARE)
  async reportScreenShare(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { sharing?: boolean; roundId?: string },
  ) {
    const competitionId = client.data.competitionId;
    const roundId = body?.roundId ?? client.data.roundId;
    const participantId = client.data.participantId;

    if (!competitionId || !roundId || !participantId) {
      return { ok: false, error: 'Not joined as participant' };
    }

    await this.audit.record({
      competitionId,
      roundId,
      roundParticipantId: participantId,
      eventType: body?.sharing
        ? CompetitionEventType.SCREEN_SHARE_STARTED
        : CompetitionEventType.SCREEN_SHARE_STOPPED,
    });

    return { ok: true };
  }

  private kickSupersededSocket(
    supersededSocketId: string,
    competitionId: string,
    participantId: string,
  ) {
    const superseded = this.server.sockets.sockets.get(supersededSocketId);
    if (superseded) {
      superseded.emit(WS_EVENTS.SESSION_SUPERSEDED, {
        event: WS_EVENTS.SESSION_SUPERSEDED,
        competition_id: competitionId,
        participant_id: participantId,
      });
      superseded.disconnect(true);
    }
  }

  private keysMatch(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length === 0 || bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
