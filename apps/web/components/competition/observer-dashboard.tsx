'use client';

import { useCallback, useState } from 'react';
import { ConnectionBanner } from './connection-banner';
import { FullscreenButton } from './fullscreen-button';
import { LiveCountdown } from './live-countdown';
import { LivePodium } from './live-podium';
import { LiveRanking } from './live-ranking';
import { ObserverAuthGate } from './observer-auth-gate';
import { ScreenShareStage } from './screen-share-stage';
import { StatusBadge } from './status-badge';
import {
  clearSession,
  type SessionUser,
} from '@/lib/competition/session';
import { useCompetitionSocket } from '@/lib/competition/use-competition-socket';

type ObserverDashboardProps = {
  competitionId: string;
};

export function ObserverDashboard({
  competitionId,
}: ObserverDashboardProps) {
  const [session, setSession] = useState<{
    token: string;
    user: SessionUser;
  } | null>(null);

  const onReady = useCallback(
    (nextSession: { token: string; user: SessionUser }) => {
      setSession(nextSession);
    },
    [],
  );

  const live = useCompetitionSocket({
    competitionId,
    token: session?.token ?? null,
    enabled: Boolean(session),
  });

  if (!session) {
    return (
      <ObserverAuthGate competitionId={competitionId} onReady={onReady} />
    );
  }

  const final = live.status === 'FINALIZED';

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-border bg-surface px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-accent sm:text-sm">
              Hirance live job challenge
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold text-foreground sm:text-4xl">
              {live.competitionName ?? 'Live competition'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={live.status} />
            <FullscreenButton />
            <button
              type="button"
              className="rounded-full px-3 py-2 text-sm text-muted-text underline"
              onClick={() => {
                clearSession();
                setSession(null);
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
        />

        <section
          className={`rounded-3xl border px-5 py-7 sm:px-8 ${
            live.status === 'LIVE' &&
            (live.timer?.time_remaining_seconds ?? 31) <= 30
              ? 'border-live-danger/50 bg-live-danger/10'
              : 'border-border bg-surface'
          }`}
        >
          <LiveCountdown timer={live.timer} status={live.status} />
        </section>

        {final ? (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-success">
              Leaderboard frozen
            </p>
            <p className="mt-2 text-lg text-muted-text">
              Official final ranking
            </p>
          </div>
        ) : (
          <p className="text-center text-base text-muted-text sm:text-lg">
            Create and successfully publish as many valid jobs as possible.
          </p>
        )}

        <LivePodium
          key={`podium-${live.lastScoreEvent?.job_id ?? 'initial'}`}
          participants={live.leaderboard}
          highlightedUserId={live.lastScoreEvent?.participant.user_id}
        />
        <LiveRanking
          key={`ranking-${live.lastScoreEvent?.job_id ?? 'initial'}`}
          participants={live.leaderboard}
          highlightedUserId={live.lastScoreEvent?.participant.user_id}
        />

        {session ? (
          <ScreenShareStage
            competitionId={competitionId}
            token={session.token}
            status={live.status}
            participants={live.leaderboard}
          />
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs text-muted-text">
          <span>Updates arrive automatically</span>
          <span role="status">
            {live.connected ? 'Connected to live feed' : 'Restoring live feed'}
          </span>
        </footer>
      </div>
    </main>
  );
}
