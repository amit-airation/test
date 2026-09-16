'use client';

import type { LeaderboardEntry } from '@/lib/competition/types';

type LivePodiumProps = {
  participants: LeaderboardEntry[];
  highlightedCompanyId?: string;
};

const PLACE = [
  { rank: 2, label: '2nd', order: 'order-1', height: 'lg:min-h-56' },
  { rank: 1, label: '1st', order: 'order-0 lg:order-2', height: 'lg:min-h-68' },
  { rank: 3, label: '3rd', order: 'order-2 lg:order-3', height: 'lg:min-h-48' },
] as const;

function formatReached(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      minute: '2-digit',
      second: '2-digit',
      hour: '2-digit',
    });
  } catch {
    return null;
  }
}

export function LivePodium({ participants, highlightedCompanyId }: LivePodiumProps) {
  return (
    <section aria-label="Top three companies">
      <div className="grid gap-3 lg:grid-cols-3 lg:items-end lg:gap-4">
        {PLACE.map((place) => {
          const participant = participants.find((e) => e.rank === place.rank);
          const highlighted = participant?.company_id === highlightedCompanyId;
          const isFirst = place.rank === 1;
          const reached = formatReached(participant?.score_reached_at);

          return (
            <article
              key={place.rank}
              className={`${place.order} ${place.height} flex flex-col items-center justify-center rounded-2xl border px-5 py-6 text-center ${
                isFirst
                  ? 'border-primary-accent/40 bg-surface'
                  : 'border-border bg-surface'
              } ${highlighted ? 'live-score-highlight' : ''}`}
            >
              <span
                className={`font-mono text-sm font-semibold uppercase tracking-[0.2em] ${
                  isFirst ? 'text-primary-accent' : 'text-muted-text'
                }`}
              >
                {place.label}
              </span>
              <h2 className="mt-3 max-w-full truncate text-xl font-semibold text-foreground sm:text-2xl lg:text-3xl">
                {participant?.company_name ?? '—'}
              </h2>
              <p className="mt-3 font-mono text-5xl font-semibold tabular-nums text-foreground sm:text-6xl lg:text-7xl">
                {participant?.score ?? 0}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-text">
                Jobs published
              </p>
              {reached ? (
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-text">
                  {reached}
                </p>
              ) : null}
              {highlighted ? (
                <p
                  className="live-score-flash mt-3 text-sm font-semibold text-success"
                  role="status"
                >
                  +1 job
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
