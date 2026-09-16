import {
  CompetitionEventType,
  type Round,
  type RoundParticipant,
} from '../../../generated/prisma/client.js';
import { RoundScoringService } from './round-scoring.service.js';

const NOW = new Date('2026-01-01T10:01:00.000Z');
const PREV_TIME = new Date('2026-01-01T10:00:46.000Z'); // 14s earlier

function context(overrides: Partial<RoundParticipant> = {}) {
  return {
    round: { id: 'r1', competitionId: 'c1' } as Round,
    participant: {
      id: 'p1',
      finalScore: 1,
      scoreReachedAt: null,
      lastScoredAt: null,
      ...overrides,
    } as RoundParticipant,
    now: NOW,
  };
}

function txStub(options: {
  duplicateJob?: boolean;
  previousScore?: boolean;
  currentScore?: number;
  remainingAfterUnpublish?: { createdAt: Date } | null;
}) {
  const currentScore = options.currentScore ?? 1;
  let updatedScore = currentScore + 1;

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
      findMany: vi.fn(() =>
        Promise.resolve(
          options.remainingAfterUnpublish
            ? [options.remainingAfterUnpublish]
            : [],
        ),
      ),
      create: vi.fn(() => Promise.resolve({ id: 'ledger-1' })),
      deleteMany: vi.fn(() =>
        Promise.resolve({ count: options.duplicateJob ? 0 : 1 }),
      ),
    },
    roundParticipant: {
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({
          id: 'p1',
          finalScore: currentScore,
          scoreReachedAt: PREV_TIME,
          lastScoredAt: PREV_TIME,
        }),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        if (data.finalScore && typeof data.finalScore === 'object') {
          const op = data.finalScore as { increment?: number; decrement?: number };
          if (op.increment) updatedScore = currentScore + op.increment;
          if (op.decrement) updatedScore = currentScore - op.decrement;
        } else if (typeof data.finalScore === 'number') {
          updatedScore = data.finalScore;
        }
        return Promise.resolve({
          id: 'p1',
          finalScore: updatedScore,
          scoreReachedAt:
            (data.scoreReachedAt as Date | null | undefined) ?? NOW,
          lastScoredAt: (data.lastScoredAt as Date | null | undefined) ?? NOW,
        });
      }),
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
      scoreReachedAt: NOW,
    });
    expect(tx.roundParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalScore: { increment: 1 },
          scoreReachedAt: NOW,
          lastScoredAt: NOW,
        }),
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

  it('recomputes scoreReachedAt from remaining ledger on unpublish', async () => {
    const remainingAt = new Date('2026-01-01T10:00:20.000Z');
    const tx = txStub({
      currentScore: 15,
      remainingAfterUnpublish: { createdAt: remainingAt },
    });

    const result = await service.recordUnpublish(
      tx as never,
      context({ finalScore: 15 }),
      'job-15',
    );

    expect(result.scored).toBe(true);
    expect(result.finalScore).toBe(14);
    expect(tx.roundParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastScoredAt: remainingAt,
          scoreReachedAt: remainingAt,
        }),
      }),
    );
  });
});
