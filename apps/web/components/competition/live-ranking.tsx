'use client';

import type { LeaderboardEntry } from '@/lib/competition/types';

type LiveRankingProps = {
  participants: LeaderboardEntry[];
  highlightedCompanyId?: string;
};

export function LiveRanking({ participants, highlightedCompanyId }: LiveRankingProps) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-text">
          Live ranking
        </h2>
        <p className="text-sm text-muted-text">
          {participants.length} participant{participants.length === 1 ? '' : 's'}
        </p>
      </div>

      <ol className="mt-5 grid gap-2 lg:grid-cols-2">
        {participants.length === 0 ? (
          <li className="col-span-full rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted-text">
            Scores will appear when participants publish jobs.
          </li>
        ) : (
          participants.map((p) => {
            const highlighted = p.company_id === highlightedCompanyId;
            return (
              <li
                key={p.company_id}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
                  highlighted
                    ? 'live-score-highlight border-border'
                    : 'border-transparent bg-background/50'
                }`}
              >
                <span className="w-10 shrink-0 font-mono text-xl font-semibold tabular-nums text-muted-text">
                  #{p.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-medium text-foreground sm:text-xl">
                  {p.display_name}
                </span>
                <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {p.score}
                </span>
                <span className="sr-only">published jobs</span>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
