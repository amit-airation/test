import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QueryCompetitionEventsDto } from '../dto/query-competition-events.dto.js';

const DEFAULT_EVENT_PAGE_SIZE = 100;

/**
 * Append-only audit trail for competition disputes. Metadata is limited to
 * identifiers and outcomes — never credentials or candidate personal data.
 */
@Injectable()
export class CompetitionAuditService {
  private readonly logger = new Logger(CompetitionAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    competitionId: string;
    eventType: CompetitionEventType;
    participantId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const event = await this.prisma.competitionEvent.create({
      data: {
        competitionId: input.competitionId,
        participantId: input.participantId ?? undefined,
        eventType: input.eventType,
        metadata: input.metadata,
      },
    });

    this.logger.log({
      event: 'audit_event_recorded',
      competition_id: input.competitionId,
      participant_id: input.participantId ?? null,
      event_type: input.eventType,
    });

    return event;
  }

  async list(competitionId: string, query: QueryCompetitionEventsDto = {}) {
    const where: Prisma.CompetitionEventWhereInput = {
      competitionId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.participantId ? { participantId: query.participantId } : {}),
    };
    const take = query.limit ?? DEFAULT_EVENT_PAGE_SIZE;
    const skip = query.offset ?? 0;

    const [total, events] = await Promise.all([
      this.prisma.competitionEvent.count({ where }),
      this.prisma.competitionEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          participant: {
            select: {
              id: true,
              userId: true,
              status: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      competition_id: competitionId,
      total,
      limit: take,
      offset: skip,
      events,
    };
  }
}
