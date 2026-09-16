'use client';

import { useCallback, useEffect, useState } from 'react';
import { JoinGate } from '@/components/competition/join-gate';
import { ConnectionBanner } from '@/components/competition/connection-banner';
import { Countdown } from '@/components/competition/countdown';
import { Leaderboard } from '@/components/competition/leaderboard';
import { RankBadge } from '@/components/competition/rank-badge';
import { RecentPublications } from '@/components/competition/recent-publications';
import { ScoreCard } from '@/components/competition/score-card';
import { ScreenShareControls } from '@/components/competition/screen-share-controls';
import { StatusBadge } from '@/components/competition/status-badge';
import { clearIdentity, type SessionIdentity } from '@/lib/competition/session';
import { useCompetitionSocket } from '@/lib/competition/use-competition-socket';

type ParticipantDashboardProps = { competitionId: string };

export function ParticipantDashboard({ competitionId }: ParticipantDashboardProps) {
  const [identity, setIdentityState] = useState<SessionIdentity | null>(null);
  const [roundTransition, setRoundTransition] = useState<string | null>(null);

  const onReady = useCallback((id: SessionIdentity) => {
    setIdentityState(id);
  }, []);

  const live = useCompetitionSocket({
    competitionId,
    companyId: identity?.companyId,
    companyName: identity?.companyName,
    enabled: Boolean(identity),
  });

  // Show a brief banner when admin switches the active round
  useEffect(() => {
    if (!live.roundNumber) return;
    setRoundTransition(`Round ${live.roundNumber} is now active`);
    const t = setTimeout(() => setRoundTransition(null), 3_500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.activeRoundId]);

  if (!identity) {
    return <JoinGate competitionId={competitionId} onReady={onReady} />;
  }

  const ownScoreEvent =
    live.lastScoreEvent?.participant.company_id === identity.companyId
      ? live.lastScoreEvent
      : null;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
              Hirance Live Challenge
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              {live.competitionName ?? 'Competition'}
            </h1>
            <p className="mt-1 text-sm text-muted-text">
              <span className="font-medium text-foreground">{identity.companyName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {live.roundNumber ? (
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-text">
                Round {live.roundNumber}
                {live.roundName ? ` — ${live.roundName}` : ''}
              </span>
            ) : null}
            <StatusBadge status={live.roundStatus} />
            <button
              type="button"
              onClick={() => { clearIdentity(); setIdentityState(null); }}
              className="text-sm text-muted-text underline"
            >
              Leave
            </button>
          </div>
        </header>

        {/* Banners */}
        {roundTransition ? (
          <div
            role="status"
            className="rounded-xl border border-primary-accent/30 bg-primary-accent/10 px-4 py-3 text-sm font-medium text-primary-accent"
          >
            {roundTransition}
          </div>
        ) : null}
        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
          sessionSuperseded={live.sessionSuperseded}
        />

        {/* Timer */}
        <Countdown timer={live.timer} status={live.roundStatus} />

        {/* Score + Rank */}
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard
            key={ownScoreEvent?.job_id ?? 'score'}
            score={live.myScore}
            flash={Boolean(ownScoreEvent)}
          />
          <RankBadge rank={live.myRank} />
        </div>

        {/* Screen share */}
        <ScreenShareControls
          competitionId={competitionId}
          roundId={live.activeRoundId}
          roundStatus={live.roundStatus}
          participantStatus={live.participantStatus}
          companyId={identity.companyId}
          companyName={identity.companyName}
          socket={live.socketRef.current}
        />

        {/* Leaderboard + Recent jobs */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Leaderboard
            participants={live.leaderboard}
            currentCompanyId={identity.companyId}
          />
          <RecentPublications jobs={live.recentJobs} />
        </div>
      </div>
    </div>
  );
}
