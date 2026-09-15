import {
  CompetitionEventType,
  type Round,
  type RoundParticipant,
} from '../../../generated/prisma/client.js';
import { RoundScoringService } from './round-scoring.service.js';

const NOW = new Date('2026-01-01T10:01:00.000Z');
const PREV_TIME = new Date('2026-01-01T10:00:46.000Z'); // 14s earlier

function context() {
  return {
    round: { id: 'r1', competitionId: 'c1' } as Round,
    participant: {
      id: 'p1',
      finalScore: 1,
      scoreReachedAt: null,
    } as RoundParticipant,
    now: NOW,
  };
}

function txStub(options: { duplicateJob?: boolean; previousScore?: boolean }) {
  return {
    roundJobScore: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options.duplicateJob
            ? { id: 'ledger-1', jobId: 'job-1' }
            : null,
        ),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.previousScore
            ? { id: 'ledger-0', createdAt: PREV_TIME }
            : null,
        ),
      ),
      create: vi.fn(() => Promise.resolve({ id: 'ledger-1' })),
    },
    roundParticipant: {
      update: vi.fn(() =>
        Promise.resolve({
          id: 'p1',
          finalScore: 2,
          scoreReachedAt: NOW,
        }),
      ),
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({
          id: 'p1',
          finalScore: 1,
          scoreReachedAt: NOW,
        }),
      ),
    },
    competitionEvent: { create: vi.fn(() => Promise.resolve({})) },
    job: { update: vi.fn(() => Promise.resolve({})) },
  };
}

describe('RoundScoringService', () => {
  const service = new RoundScoringService();

  it('increments score and records postDurationSeconds as null for 1st job', async () => {
    const tx = txStub({});

    const result = await service.recordSuccessfulPublish(
      tx as never,
      context(),
      'job-1',
    );

    expect(result).toMatchObject({
      scored: true,
      finalScore: 2,
      postDurationSeconds: null,
    });
    expect(tx.roundParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalScore: { increment: 1 } }),
      }),
    );
    expect(tx.competitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: CompetitionEventType.JOB_PUBLISHED,
        }),
      }),
    );
  });

  it('computes postDurationSeconds accurately for 2nd+ job', async () => {
    const tx = txStub({ previousScore: true });

    const result = await service.recordSuccessfulPublish(
      tx as never,
      context(),
      'job-2',
    );

    expect(result).toMatchObject({
      scored: true,
      finalScore: 2,
      postDurationSeconds: 14,
    });
  });

  it('does not double count when the same job is scored twice', async () => {
    const tx = txStub({ duplicateJob: true });

    const result = await service.recordSuccessfulPublish(
      tx as never,
      context(),
      'job-1',
    );

    expect(result).toMatchObject({ scored: false, finalScore: 1 });
    expect(tx.roundParticipant.update).not.toHaveBeenCalled();
    expect(tx.competitionEvent.create).not.toHaveBeenCalled();
  });
});
