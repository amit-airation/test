'use client';

type ScoreCardProps = {
  score: number | null;
  flash?: boolean;
};

export function ScoreCard({ score, flash }: ScoreCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-8 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-text">
        Your score
      </p>
      <p
        className={`mt-2 font-mono text-7xl font-semibold tabular-nums text-foreground ${
          flash ? 'score-bump' : ''
        }`}
        aria-live="polite"
      >
        {score ?? 0}
      </p>
      <p className="mt-2 text-sm text-muted-text">Jobs successfully published</p>
      {flash ? (
        <p className="live-score-flash mt-3 text-sm font-medium text-success">
          +1 JOB
        </p>
      ) : null}
    </div>
  );
}
