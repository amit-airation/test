import { resolveJobTitle } from './job-title.js';
import { ROUND_PARTICIPANT_RANK_ORDER } from './rank-order.js';

type RankRow = {
  id: string;
  finalScore: number;
  scoreReachedAt: Date | null;
  createdAt: Date;
};

/** In-memory mirror of ROUND_PARTICIPANT_RANK_ORDER (nulls last). */
function sortByScoreThenTime(rows: RankRow[]): RankRow[] {
  return [...rows].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;

    if (a.scoreReachedAt && b.scoreReachedAt) {
      const d = a.scoreReachedAt.getTime() - b.scoreReachedAt.getTime();
      if (d !== 0) return d;
    } else if (a.scoreReachedAt && !b.scoreReachedAt) {
      return -1;
    } else if (!a.scoreReachedAt && b.scoreReachedAt) {
      return 1;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

describe('ROUND_PARTICIPANT_RANK_ORDER', () => {
  it('exports score DESC then scoreReachedAt ASC', () => {
    expect(ROUND_PARTICIPANT_RANK_ORDER).toEqual([
      { finalScore: 'desc' },
      { scoreReachedAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ]);
  });

  it('ranks higher score above lower score regardless of time', () => {
    const early = new Date('2026-01-01T10:04:55.000Z');
    const late = new Date('2026-01-01T10:04:35.000Z');
    const created = new Date('2026-01-01T09:00:00.000Z');

    const ranked = sortByScoreThenTime([
      { id: 'D', finalScore: 24, scoreReachedAt: early, createdAt: created },
      { id: 'A', finalScore: 25, scoreReachedAt: late, createdAt: created },
    ]);

    expect(ranked.map((r) => r.id)).toEqual(['A', 'D']);
  });

  it('breaks equal scores by earlier scoreReachedAt (event time)', () => {
    const t435 = new Date('2026-01-01T10:04:35.000Z');
    const t442 = new Date('2026-01-01T10:04:42.000Z');
    const t450 = new Date('2026-01-01T10:04:50.000Z');
    const created = new Date('2026-01-01T09:00:00.000Z');

    const ranked = sortByScoreThenTime([
      { id: 'C', finalScore: 25, scoreReachedAt: t450, createdAt: created },
      { id: 'A', finalScore: 25, scoreReachedAt: t435, createdAt: created },
      { id: 'B', finalScore: 25, scoreReachedAt: t442, createdAt: created },
      { id: 'D', finalScore: 24, scoreReachedAt: t450, createdAt: created },
    ]);

    expect(ranked.map((r) => r.id)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('resolveJobTitle', () => {
  it('prefers title over name', () => {
    expect(resolveJobTitle({ title: 'Backend', name: 'Other' })).toBe('Backend');
  });

  it('accepts name as title alias', () => {
    expect(resolveJobTitle({ name: 'Frontend Engineer' })).toBe(
      'Frontend Engineer',
    );
  });

  it('returns empty when neither set', () => {
    expect(resolveJobTitle({})).toBe('');
    expect(resolveJobTitle(null)).toBe('');
  });
});
