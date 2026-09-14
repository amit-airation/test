import { BadRequestException } from '@nestjs/common';
import {
  CompetitionStatus,
  ParticipantStatus,
  type Competition,
  type CompetitionParticipant,
} from '../../../../generated/prisma/client.js';
import { CompetitionTimerService } from '../../services/competition-timer.service.js';
import { CompetitionJobValidator } from './competition-job.validator.js';

const START = new Date('2026-01-01T10:00:00.000Z');
const END = new Date('2026-01-01T10:05:00.000Z');

function competition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'c1',
    status: CompetitionStatus.LIVE,
    actualStartAt: START,
    endAt: END,
    durationSeconds: 300,
    ...overrides,
  } as Competition;
}

function participant(
  overrides: Partial<CompetitionParticipant> = {},
): CompetitionParticipant {
  return {
    id: 'p1',
    status: ParticipantStatus.ACTIVE,
    finalScore: 0,
    ...overrides,
  } as CompetitionParticipant;
}

describe('CompetitionJobValidator', () => {
  const validator = new CompetitionJobValidator(new CompetitionTimerService());

  it('accepts a publish one millisecond before end_at', () => {
    const now = new Date(END.getTime() - 1);
    expect(
      validator.assertCanPublishCompetitionJob(
        competition(),
        participant(),
        now,
      ).now,
    ).toBe(now);
  });

  it('rejects a publish exactly at end_at', () => {
    expect(() =>
      validator.assertCanPublishCompetitionJob(
        competition(),
        participant(),
        END,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a publish before the competition starts', () => {
    expect(() =>
      validator.assertCanPublishCompetitionJob(
        competition(),
        participant(),
        new Date(START.getTime() - 1),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects publishing while the competition is not LIVE', () => {
    for (const status of [
      CompetitionStatus.SCHEDULED,
      CompetitionStatus.ENDED,
      CompetitionStatus.FINALIZED,
      CompetitionStatus.CANCELLED,
    ]) {
      expect(() =>
        validator.assertCanPublishCompetitionJob(
          competition({ status }),
          participant(),
          START,
        ),
      ).toThrow(BadRequestException);
    }
  });

  it('rejects a non-participant publishing into the competition', () => {
    expect(() =>
      validator.assertCanPublishCompetitionJob(competition(), null, START),
    ).toThrow(BadRequestException);
  });

  it('rejects disqualified participants on create and publish', () => {
    const disqualified = participant({
      status: ParticipantStatus.DISQUALIFIED,
    });

    expect(() =>
      validator.assertCanCreateCompetitionJob(competition(), disqualified),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.assertCanPublishCompetitionJob(
        competition(),
        disqualified,
        START,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a competition without a configured timer window', () => {
    expect(() =>
      validator.assertCanPublishCompetitionJob(
        competition({ actualStartAt: null, endAt: null }),
        participant(),
        START,
      ),
    ).toThrow(BadRequestException);
  });

  it('enforces minimum job field quality', () => {
    expect(() => validator.assertCompetitionJobFields({ title: 'ab' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      validator.assertCompetitionJobFields({
        title: 'Senior Engineer',
        description: 'short',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.assertCompetitionJobFields({ title: 'Senior Engineer' }),
    ).not.toThrow();
  });
});
