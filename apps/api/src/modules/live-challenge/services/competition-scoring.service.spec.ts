import {
  CompetitionEventType,
  type Competition,
  type CompetitionParticipant,
} from '../../../generated/prisma/client.js';
import { CompetitionScoringService } from './competition-scoring.service.js';

const NOW = new Date('2026-01-01T10:01:00.000Z');

function context() {
  return {
    competition: { id: 'c1' } as Competition,
    participant: {
      id: 'p1',
      finalScore: 3,
      scoreReachedAt: null,
    } as CompetitionParticipant,
    now: NOW,
  };
}

function txStub(options: { duplicateJob?: boolean }) {
  return {
    competitionJobScore: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options.duplicateJob
            ? { id: 'ledger-1', jobId: 'job-1' }
            : null,
        ),
      ),
      create: vi.fn(() => Promise.resolve({ id: 'ledger-1' })),
    },
    competitionParticipant: {
      update: vi.fn(() =>
        Promise.resolve({
          id: 'p1',
          finalScore: 4,
          scoreReachedAt: NOW,
        }),
      ),
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({
          id: 'p1',
          finalScore: 3,
          scoreReachedAt: NOW,
        }),
      ),
    },
    competitionEvent: { create: vi.fn(() => Promise.resolve({})) },
    job: { update: vi.fn(() => Promise.resolve({})) },
  };
}

describe('CompetitionScoringService', () => {
  const service = new CompetitionScoringService({} as never);

  it('increments the score once and audits the publish', async () => {
    const tx = txStub({});

    const result = await service.recordSuccessfulPublish(
      tx as never,
      context(),
      'job-1',
    );

    expect(result).toMatchObject({ scored: true, finalScore: 4 });
    expect(tx.competitionParticipant.update).toHaveBeenCalledWith(
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
    expect(tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scoredAt: NOW } }),
    );
  });

  it('does not double count when the same job is scored twice', async () => {
    const tx = txStub({ duplicateJob: true });

    const result = await service.recordSuccessfulPublish(
      tx as never,
      context(),
      'job-1',
    );

    expect(result).toMatchObject({ scored: false, finalScore: 3 });
    expect(tx.competitionParticipant.update).not.toHaveBeenCalled();
    expect(tx.competitionEvent.create).not.toHaveBeenCalled();
  });

  it('propagates unexpected ledger failures', async () => {
    const tx = txStub({});
    tx.competitionJobScore.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordSuccessfulPublish(tx as never, context(), 'job-1'),
    ).rejects.toThrow('db down');
  });
});
