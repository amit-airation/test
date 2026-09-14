'use client';

type LeaderboardProps = {
  participants: Array<{
    rank: number;
    user_id: string;
    name: string;
    score: number;
  }>;
  currentUserId?: string | null;
};

export function Leaderboard({ participants, currentUserId }: LeaderboardProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-text">
        Leaderboard
      </h2>
      <ol className="mt-4 space-y-2">
        {participants.length === 0 ? (
          <li className="text-sm text-muted-text">No scores yet.</li>
        ) : (
          participants.slice(0, 10).map((row) => {
            const isMe = currentUserId === row.user_id;
            return (
              <li
                key={row.user_id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                  isMe ? 'bg-primary-accent/10 text-foreground' : 'text-foreground'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-muted-text">
                    #{row.rank}
                  </span>
                  <span className="font-medium">
                    {row.name}
                    {isMe ? ' (you)' : ''}
                  </span>
                </span>
                <span className="font-mono text-lg tabular-nums font-semibold">
                  {row.score}
                </span>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
