import { BadRequestException, ConflictException } from '@nestjs/common';

export class InvalidCompetitionTransitionException extends BadRequestException {
  constructor(from: string, to: string) {
    super(`Invalid competition transition: ${from} → ${to}`);
  }
}

export class CompetitionNotActiveException extends BadRequestException {
  constructor(competitionId: string) {
    super(`Competition ${competitionId} is not LIVE`);
  }
}

export class ParticipantAlreadyRegisteredException extends ConflictException {
  constructor() {
    super('User is already registered for this competition');
  }
}
