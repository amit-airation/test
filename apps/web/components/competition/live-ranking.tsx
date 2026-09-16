'use client';

import type { LeaderboardEntry } from '@/lib/competition/types';

type LiveRankingProps = {
  participants: LeaderboardEntry[];
  highlightedCompanyId?: string;
};

export function LiveRanking({ participants, highlightedCompanyId }: LiveRankingProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-text">
          Full ranking
        </h2>
        <p className="text-sm tabular-nums text-muted-text">
          {participants.length}{' '}
          {participants.length === 1 ? 'company' : 'companies'}
        </p>
      </div>

      <ol className="mt-4 grid gap-2 lg:grid-cols-2">
        {participants.length === 0 ? (
          <li className="col-span-full rounded-xl border border-dashed border-border px-5 py-10 text-center text-muted-text">
            Scores appear when companies publish jobs.
          </li>
        ) : (
          participants.map((p) => {
            const highlighted = p.company_id === highlightedCompanyId;
            return (
              <li
                key={p.company_id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 sm:gap-4 sm:px-4 sm:py-3 ${
                  highlighted
                    ? 'live-score-highlight border-border'
                    : 'border-transparent bg-background/60'
                }`}
              >
                <span className="w-9 shrink-0 font-mono text-lg font-semibold tabular-nums text-muted-text sm:w-10 sm:text-xl">
                  #{p.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground sm:text-lg">
                  {p.company_name}
                </span>
                <span className="font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
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
