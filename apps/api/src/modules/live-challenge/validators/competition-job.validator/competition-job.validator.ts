import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  CompetitionStatus,
  ParticipantStatus,
  type Competition,
  type CompetitionParticipant,
} from '../../../../generated/prisma/client.js';
import { CompetitionTimerService } from '../../services/competition-timer.service.js';

export type CompetitionPublishContext = {
  competition: Competition;
  participant: CompetitionParticipant;
  now: Date;
};

@Injectable()
export class CompetitionJobValidator {
  constructor(private readonly timer: CompetitionTimerService) {}

  assertCanCreateCompetitionJob(
    competition: Competition,
    participant: CompetitionParticipant | null,
  ) {
    if (!participant) {
      throw new BadRequestException(
        'You must be a registered participant to create a competition job',
      );
    }

    if (
      participant.status === ParticipantStatus.DISQUALIFIED
    ) {
      throw new BadRequestException(
        'Participant is not eligible to create competition jobs',
      );
    }

    if (
      competition.status !== CompetitionStatus.LIVE &&
      competition.status !== CompetitionStatus.SCHEDULED &&
      competition.status !== CompetitionStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Competition is not open for job creation',
      );
    }
  }

  assertCanPublishCompetitionJob(
    competition: Competition,
    participant: CompetitionParticipant | null,
    now: Date = this.timer.now(),
  ): CompetitionPublishContext {
    if (!participant) {
      throw new BadRequestException(
        'You must be a registered participant to publish a competition job',
      );
    }

    if (participant.status === ParticipantStatus.DISQUALIFIED) {
      throw new BadRequestException('Participant is disqualified');
    }

    if (competition.status !== CompetitionStatus.LIVE) {
      throw new BadRequestException('Competition is not LIVE');
    }

    if (!competition.endAt || !competition.actualStartAt) {
      throw new BadRequestException('Competition timer is not configured');
    }

    // Policy: published successfully before end_at = counts;
    // published at/after end_at = rejected and does not count.
    if (now.getTime() >= competition.endAt.getTime()) {
      throw new BadRequestException(
        'Competition has ended; publishes are no longer accepted',
      );
    }

    if (now.getTime() < competition.actualStartAt.getTime()) {
      throw new BadRequestException('Competition has not started yet');
    }

    return { competition, participant, now };
  }

  assertCompetitionJobFields(input: {
    title: string;
    description?: string | null;
    location?: string | null;
    employmentType?: string | null;
  }) {
    if (!input.title || input.title.trim().length < 3) {
      throw new BadRequestException('Job title must be at least 3 characters');
    }
    // Competition-specific extras (configurable later):
    if (input.description != null && input.description.trim().length < 10) {
      throw new BadRequestException(
        'Competition jobs require a description of at least 10 characters when provided',
      );
    }
  }
}
