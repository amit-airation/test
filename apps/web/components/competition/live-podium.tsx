'use client';

type Entry = {
  rank: number;
  user_id: string;
  name: string;
  score: number;
};

type LivePodiumProps = {
  participants: Entry[];
  highlightedUserId?: string;
};

const PLACE = [
  { rank: 2, label: 'Second', medal: '🥈', order: 'order-1', height: 'lg:min-h-60' },
  { rank: 1, label: 'First', medal: '🥇', order: 'order-0 lg:order-2', height: 'lg:min-h-72' },
  { rank: 3, label: 'Third', medal: '🥉', order: 'order-2 lg:order-3', height: 'lg:min-h-52' },
] as const;

export function LivePodium({
  participants,
  highlightedUserId,
}: LivePodiumProps) {
  return (
    <section aria-label="Top three participants">
      <div className="grid gap-4 lg:grid-cols-3 lg:items-end">
        {PLACE.map((place) => {
          const participant = participants.find(
            (entry) => entry.rank === place.rank,
          );
          const highlighted = participant?.user_id === highlightedUserId;

          return (
            <article
              key={place.rank}
              className={`${place.order} ${place.height} flex flex-col items-center justify-center rounded-3xl border border-border bg-surface p-6 text-center ${
                highlighted ? 'live-score-highlight' : ''
              }`}
            >
              <span className="text-5xl" aria-hidden>
                {place.medal}
              </span>
              <span className="sr-only">{place.label} place</span>
              <h2 className="mt-3 max-w-full truncate text-2xl font-semibold text-foreground sm:text-3xl">
                {participant?.name ?? 'Waiting…'}
              </h2>
              <p className="mt-3 font-mono text-6xl font-semibold tabular-nums text-foreground sm:text-7xl">
                {participant?.score ?? 0}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
                Jobs
              </p>
              {highlighted ? (
                <p
                  className="live-score-flash mt-3 text-sm font-semibold text-success"
                  role="status"
                >
                  +1 JOB
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
