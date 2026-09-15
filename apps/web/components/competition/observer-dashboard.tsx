'use client';

import { useEffect, useState } from 'react';
import { ConnectionBanner } from './connection-banner';
import { FullscreenButton } from './fullscreen-button';
import { LiveCountdown } from './live-countdown';
import { LivePodium } from './live-podium';
import { LiveRanking } from './live-ranking';
import { ScreenShareStage } from './screen-share-stage';
import { StatusBadge } from './status-badge';
import { useCompetitionSocket } from '@/lib/competition/use-competition-socket';
import { fetchRoundLeaderboard } from '@/lib/competition/api';
import type { LeaderboardEntry, TimerSnapshot } from '@/lib/competition/types';

type ObserverDashboardProps = { competitionId: string };

export function ObserverDashboard({ competitionId }: ObserverDashboardProps) {
  // Observers connect without a companyId — no presence session claimed
  const live = useCompetitionSocket({
    competitionId,
    enabled: true,
  });

  // Local tab: which round tab is selected (may differ from live.activeRoundId)
  const [viewingRoundId, setViewingRoundId] = useState<string | null>(null);

  // Cached leaderboards per round (so switching tabs shows frozen past results)
  const [cachedBoards, setCachedBoards] = useState<
    Record<string, { participants: LeaderboardEntry[]; timer: TimerSnapshot | null }>
  >({});

  // Active round switching: auto-follow admin's choice
  useEffect(() => {
    if (live.activeRoundId) {
      setViewingRoundId(live.activeRoundId);
    }
  }, [live.activeRoundId]);

  // When viewing a past round that isn't loaded yet, fetch its leaderboard
  useEffect(() => {
    if (!viewingRoundId || cachedBoards[viewingRoundId]) return;
    void fetchRoundLeaderboard(competitionId, viewingRoundId)
      .then((board) => {
        setCachedBoards((prev) => ({
          ...prev,
          [viewingRoundId]: {
            participants: board.participants,
            timer: board.timer,
          },
        }));
      })
      .catch(() => undefined);
  }, [viewingRoundId, cachedBoards, competitionId]);

  // Always keep the live leaderboard in cache for the active round
  useEffect(() => {
    if (!live.activeRoundId) return;
    setCachedBoards((prev) => ({
      ...prev,
      [live.activeRoundId!]: {
        participants: live.leaderboard,
        timer: live.timer,
      },
    }));
  }, [live.leaderboard, live.timer, live.activeRoundId]);

  const viewedBoard = viewingRoundId ? (cachedBoards[viewingRoundId] ?? null) : null;
  const viewedParticipants = viewedBoard?.participants ?? [];
  const isViewingActive = viewingRoundId === live.activeRoundId;

  const viewedRound = live.allRounds.find((r) => r.id === viewingRoundId);
  const isViewedRoundFinal =
    viewedRound?.status === 'FINALIZED' || viewedRound?.status === 'ENDED';
  const isViewedRoundLive = viewedRound?.status === 'LIVE';

  const highlightedId = live.lastScoreEvent?.participant.company_id;

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-6">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-border bg-surface px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-accent sm:text-sm">
              Hirance live challenge
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold text-foreground sm:text-4xl">
              {live.competitionName ?? 'Live competition'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={live.roundStatus} />
            <FullscreenButton />
          </div>
        </header>

        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
        />

        {/* Round tab bar */}
        {live.allRounds.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="tablist">
            {live.allRounds.map((r) => {
              const isActive = r.id === live.activeRoundId;
              const isSelected = r.id === viewingRoundId;
              const isDone = r.status === 'FINALIZED' || r.status === 'ENDED';
              return (
                <button
                  key={r.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setViewingRoundId(r.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-primary-accent text-white'
                      : 'border border-border bg-surface text-muted-text hover:border-primary-accent hover:text-foreground'
                  }`}
                >
                  Round {r.round_number}
                  {r.name ? ` · ${r.name}` : ''}
                  {isActive && !isDone ? (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success align-middle" />
                  ) : null}
                  {isDone ? (
                    <span className="ml-1.5 text-xs font-normal opacity-60">
                      Final
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Countdown — only for the active live round */}
        {isViewingActive && isViewedRoundLive ? (
          <section
            className={`rounded-3xl border px-5 py-7 sm:px-8 ${
              (live.timer?.time_remaining_seconds ?? 31) <= 30
                ? 'border-live-danger/50 bg-live-danger/10'
                : 'border-border bg-surface'
            }`}
          >
            <LiveCountdown timer={live.timer} status={live.roundStatus} />
          </section>
        ) : null}

        {/* Final / waiting state label */}
        {isViewedRoundFinal ? (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-success">
              Leaderboard frozen
            </p>
            <p className="mt-1 text-base text-muted-text">
              {viewedRound?.name
                ? `Official final ranking — ${viewedRound.name}`
                : 'Official final ranking'}
            </p>
          </div>
        ) : isViewingActive && !isViewedRoundLive ? (
          <p className="text-center text-base text-muted-text">
            Waiting for the round to start…
          </p>
        ) : isViewingActive ? (
          <p className="text-center text-base text-muted-text">
            Create and publish as many valid jobs as possible.
          </p>
        ) : null}

        {/* Podium */}
        <LivePodium
          key={`podium-${viewingRoundId}-${live.lastScoreEvent?.job_id ?? ''}`}
          participants={viewedParticipants}
          highlightedCompanyId={isViewingActive ? highlightedId : undefined}
        />

        {/* Full ranking */}
        <LiveRanking
          key={`ranking-${viewingRoundId}-${live.lastScoreEvent?.job_id ?? ''}`}
          participants={viewedParticipants}
          highlightedCompanyId={isViewingActive ? highlightedId : undefined}
        />

        {/* Screen share — only for the active live round */}
        {isViewingActive ? (
          <ScreenShareStage
            competitionId={competitionId}
            roundId={live.activeRoundId}
            roundStatus={live.roundStatus}
            participants={live.leaderboard}
          />
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs text-muted-text">
          <span>Updates arrive automatically</span>
          <span role="status">
            {live.connected ? 'Connected to live feed' : 'Restoring live feed…'}
          </span>
        </footer>
      </div>
    </main>
  );
}
