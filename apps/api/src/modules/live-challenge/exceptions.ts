import { BadRequestException, ConflictException } from '@nestjs/common';

export class InvalidRoundTransitionException extends BadRequestException {
  constructor(from: string, to: string) {
    super(`Invalid round transition: ${from} → ${to}`);
  }
}

export class RoundNotActiveException extends BadRequestException {
  constructor(roundId: string) {
    super(`Round ${roundId} is not LIVE`);
  }
}

export class ParticipantAlreadyRegisteredException extends ConflictException {
  constructor() {
    super('Company is already registered for this round');
  }
}
