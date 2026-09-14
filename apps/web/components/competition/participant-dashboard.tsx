'use client';

import { useCallback, useState } from 'react';
import { AuthGate } from '@/components/competition/auth-gate';
import { ConnectionBanner } from '@/components/competition/connection-banner';
import { Countdown } from '@/components/competition/countdown';
import { JobCreateEntry } from '@/components/competition/job-create-entry';
import { Leaderboard } from '@/components/competition/leaderboard';
import { RankBadge } from '@/components/competition/rank-badge';
import { RecentPublications } from '@/components/competition/recent-publications';
import { ScoreCard } from '@/components/competition/score-card';
import { ScreenShareControls } from '@/components/competition/screen-share-controls';
import { StatusBadge } from '@/components/competition/status-badge';
import { clearSession, type SessionUser } from '@/lib/competition/session';
import { useCompetitionSocket } from '@/lib/competition/use-competition-socket';

type ParticipantDashboardProps = {
  competitionId: string;
};

export function ParticipantDashboard({
  competitionId,
}: ParticipantDashboardProps) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const onReady = useCallback(
    (session: {
      token: string;
      user: SessionUser;
      companyId: string | null;
    }) => {
      setToken(session.token);
      setUser(session.user);
    },
    [],
  );

  const live = useCompetitionSocket({
    competitionId,
    token,
    userId: user?.id,
    enabled: Boolean(token && user),
  });

  if (!token || !user) {
    return <AuthGate competitionId={competitionId} onReady={onReady} />;
  }

  const canPublish = live.status === 'LIVE';
  const ownScoreEvent =
    live.lastScoreEvent?.participant.user_id === user.id
      ? live.lastScoreEvent
      : null;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
              Hirance job challenge
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              {live.competitionName ?? 'Competition'}
            </h1>
            <p className="mt-1 text-sm text-muted-text">
              Signed in as {user.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={live.status} />
            <button
              type="button"
              onClick={() => {
                clearSession();
                setToken(null);
                setUser(null);
              }}
              className="text-sm text-muted-text underline"
            >
              Sign out
            </button>
          </div>
        </header>

        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
          sessionSuperseded={live.sessionSuperseded}
        />

        <Countdown timer={live.timer} status={live.status} />

        {live.externalUserId === undefined ? null : live.externalUserId ? (
          <p className="text-sm text-muted-text">
            Linked job-server id:{' '}
            <span className="font-medium text-foreground">
              {live.externalUserId}
            </span>
            . Jobs published in the Hirance app also count.
          </p>
        ) : (
          <p
            className="rounded-xl border border-live-danger/40 bg-live-danger/10 px-4 py-3 text-sm text-live-danger"
            role="alert"
          >
            No job-server user id is linked. Jobs you publish on the external
            app will not count until an admin links your external user id.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard
            key={ownScoreEvent?.job_id ?? 'score'}
            score={live.myScore}
            flash={Boolean(ownScoreEvent)}
          />
          <RankBadge rank={live.myRank} />
        </div>

        <JobCreateEntry
          token={token}
          competitionId={competitionId}
          companyId={live.companyId}
          disabled={!canPublish}
          onPublished={(job) => {
            live.prependRecentJob(job);
            if (job.myScore != null) live.setMyScore(job.myScore);
          }}
        />

        <ScreenShareControls
          competitionId={competitionId}
          token={token}
          status={live.status}
          participantStatus={live.participantStatus}
          socket={live.socket.current}
        />

        {!canPublish ? (
          <p className="text-center text-sm text-muted-text">
            Job publishing is available while the competition is LIVE.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Leaderboard
            participants={live.leaderboard}
            currentUserId={user.id}
          />
          <RecentPublications jobs={live.recentJobs} />
        </div>
      </div>
    </div>
  );
}
