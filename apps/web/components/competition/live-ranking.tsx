'use client';

type Entry = {
  rank: number;
  user_id: string;
  name: string;
  score: number;
};

type LiveRankingProps = {
  participants: Entry[];
  highlightedUserId?: string;
};

export function LiveRanking({
  participants,
  highlightedUserId,
}: LiveRankingProps) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-text">
          Live ranking
        </h2>
        <p className="text-sm text-muted-text">
          {participants.length} participant
          {participants.length === 1 ? '' : 's'}
        </p>
      </div>

      <ol className="mt-5 grid gap-2 lg:grid-cols-2">
        {participants.length === 0 ? (
          <li className="col-span-full rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted-text">
            Scores will appear when participants publish jobs.
          </li>
        ) : (
          participants.map((participant) => {
            const highlighted = participant.user_id === highlightedUserId;
            return (
              <li
                key={participant.user_id}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
                  highlighted
                    ? 'live-score-highlight border-border'
                    : 'border-transparent bg-background/50'
                }`}
              >
                <span className="w-10 shrink-0 font-mono text-xl font-semibold tabular-nums text-muted-text">
                  #{participant.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-medium text-foreground sm:text-xl">
                  {participant.name}
                </span>
                <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {participant.score}
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
