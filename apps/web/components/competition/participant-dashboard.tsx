'use client';

import { useCallback, useState } from 'react';
import { JoinGate } from '@/components/competition/join-gate';
import { ConnectionBanner } from '@/components/competition/connection-banner';
import { ScreenShareControls } from '@/components/competition/screen-share-controls';
import { StatusBadge } from '@/components/competition/status-badge';
import { clearIdentity, type SessionIdentity } from '@/lib/competition/session';
import { useCompetitionSocket } from '@/lib/competition/use-competition-socket';

type ParticipantDashboardProps = { competitionId: string };

export function ParticipantDashboard({ competitionId }: ParticipantDashboardProps) {
  const [identity, setIdentityState] = useState<SessionIdentity | null>(null);

  const onReady = useCallback((id: SessionIdentity) => {
    setIdentityState(id);
  }, []);

  const live = useCompetitionSocket({
    competitionId,
    companyId: identity?.companyId,
    companyName: identity?.companyName,
    enabled: Boolean(identity),
  });

  if (!identity) {
    return <JoinGate competitionId={competitionId} onReady={onReady} />;
  }

  const notInRound =
    Boolean(live.activeRoundId) &&
    live.participantStatus == null &&
    !live.sessionSuperseded;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
              Hirance Live Challenge
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              Screen share
            </h1>
            <p className="mt-1 text-sm text-muted-text">
              <span className="font-medium text-foreground">
                {identity.companyName}
              </span>
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
              onClick={() => {
                clearIdentity();
                setIdentityState(null);
              }}
              className="text-sm text-muted-text underline"
            >
              Leave
            </button>
          </div>
        </header>

        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
          sessionSuperseded={live.sessionSuperseded}
        />

        {live.participantStatus === 'DISQUALIFIED' ? (
          <div
            role="alert"
            className="rounded-xl border border-live-danger/40 bg-live-danger/10 px-4 py-3 text-sm font-medium text-live-danger"
          >
            You have been disqualified from this round. Screen share is disabled.
          </div>
        ) : null}

        {notInRound ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-text"
          >
            You are not registered for this round. Ask the admin to add your
            company to the roster.
          </div>
        ) : null}

        {!live.activeRoundId ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-text"
          >
            Waiting for the admin to start a round.
          </div>
        ) : null}

        {live.roundStatus &&
        live.roundStatus !== 'LIVE' &&
        live.activeRoundId &&
        !notInRound &&
        live.participantStatus !== 'DISQUALIFIED' ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-text"
          >
            Waiting for the round to go live. Screen share unlocks when the
            round starts.
          </div>
        ) : null}

        {!notInRound ? (
          <ScreenShareControls
            competitionId={competitionId}
            roundId={live.activeRoundId}
            roundStatus={live.roundStatus}
            participantStatus={live.participantStatus}
            companyId={identity.companyId}
            companyName={identity.companyName}
            socket={live.socketRef.current}
          />
        ) : null}
      </div>
    </div>
  );
}
