'use client';

type RankBadgeProps = {
  rank: number | null;
};

export function RankBadge({ rank }: RankBadgeProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-text">
        Current rank
      </p>
      <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-primary-accent">
        {rank != null ? `#${rank}` : '—'}
      </p>
    </div>
  );
}
