'use client';

import type { LeaderboardEntry } from '@/lib/competition/types';

type LeaderboardProps = {
  participants: LeaderboardEntry[];
  currentCompanyId?: string | null;
};

export function Leaderboard({
  participants,
  currentCompanyId,
}: LeaderboardProps) {
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
            const isMe = currentCompanyId === row.company_id;
            return (
              <li
                key={row.company_id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                  isMe ? 'bg-primary-accent/10' : ''
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-7 font-mono text-sm tabular-nums text-muted-text">
                    #{row.rank}
                  </span>
                  <span className="font-medium text-foreground">
                    {row.display_name}
                    {isMe ? (
                      <span className="ml-1.5 text-xs text-primary-accent">
                        (you)
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
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
