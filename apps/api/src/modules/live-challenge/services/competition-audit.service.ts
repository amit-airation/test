import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class CompetitionAuditService {
  private readonly logger = new Logger(CompetitionAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    competitionId: string;
    eventType: CompetitionEventType;
    roundId?: string | null;
    roundParticipantId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const event = await this.prisma.competitionEvent.create({
      data: {
        competitionId: input.competitionId,
        roundId: input.roundId ?? undefined,
        roundParticipantId: input.roundParticipantId ?? undefined,
        eventType: input.eventType,
        metadata: input.metadata,
      },
    });

    this.logger.log({
      event: 'audit_event_recorded',
      competition_id: input.competitionId,
      round_id: input.roundId ?? null,
      event_type: input.eventType,
    });

    return event;
  }
}
