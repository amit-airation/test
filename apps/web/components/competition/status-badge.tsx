'use client';

type StatusBadgeProps = {
  status: string | null;
};

const LABELS: Record<string, string> = {
  DRAFT: 'Not started',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  ENDED: 'Ended',
  FINALIZED: 'Results',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status ? LABELS[status] ?? status : 'Loading';
  const live = status === 'LIVE';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        live
          ? 'border-live-danger/40 bg-live-danger/10 text-live-danger'
          : 'border-border bg-surface text-muted-text'
      }`}
    >
      {live ? (
        <span className="h-2 w-2 animate-pulse rounded-full bg-live-danger" />
      ) : null}
      {label}
    </span>
  );
}
