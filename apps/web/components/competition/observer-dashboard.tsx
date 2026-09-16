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

function formatPostDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

export function ObserverDashboard({ competitionId }: ObserverDashboardProps) {
  const live = useCompetitionSocket({
    competitionId,
    enabled: true,
  });

  const [viewingRoundId, setViewingRoundId] = useState<string | null>(null);
  const [cachedBoards, setCachedBoards] = useState<
    Record<string, { participants: LeaderboardEntry[]; timer: TimerSnapshot | null }>
  >({});

  useEffect(() => {
    if (live.activeRoundId) {
      setViewingRoundId(live.activeRoundId);
    }
  }, [live.activeRoundId]);

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
  const scoreFlashName = live.lastScoreEvent?.participant.company_name;
  const scoreFlashDuration = formatPostDuration(
    live.lastScoreEvent?.post_duration_seconds,
  );
  const urgent =
    isViewingActive &&
    isViewedRoundLive &&
    live.timer?.phase !== 'countdown' &&
    (live.timer?.countdown_to_start_seconds ?? 0) === 0 &&
    (live.timer?.time_remaining_seconds ?? 31) <= 30;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-5 p-4 sm:p-6 lg:gap-6 lg:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-primary-accent sm:text-xs">
              Hirance
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {live.competitionName ?? 'Live competition'}
            </h1>
            {viewedRound ? (
              <p className="mt-1 text-sm text-muted-text">
                Round {viewedRound.round_number}
                {viewedRound.name ? ` · ${viewedRound.name}` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={isViewingActive ? live.roundStatus : viewedRound?.status ?? null} />
            <FullscreenButton />
          </div>
        </header>

        <ConnectionBanner
          connected={live.connected}
          reconnecting={live.reconnecting}
        />

        {live.allRounds.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rounds">
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
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-primary-accent text-white'
                      : 'border border-border bg-surface text-muted-text hover:border-primary-accent hover:text-foreground'
                  }`}
                >
                  Round {r.round_number}
                  {isActive && !isDone ? (
                    <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success align-middle" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {isViewingActive && isViewedRoundLive ? (
          <section
            className={`rounded-2xl border px-5 py-6 sm:px-8 sm:py-8 ${
              urgent
                ? 'border-live-danger/50 bg-live-danger/10'
                : 'border-border bg-surface'
            }`}
          >
            <LiveCountdown timer={live.timer} status={live.roundStatus} />
            {scoreFlashName && isViewingActive ? (
              <p
                key={live.lastScoreEvent?.job_id}
                className="live-score-flash mt-4 text-center text-sm font-semibold text-success sm:text-base"
                role="status"
              >
                +1 · {scoreFlashName}
                {scoreFlashDuration ? ` · ${scoreFlashDuration} since last` : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {isViewedRoundFinal ? (
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-success">
              Final results
            </p>
            <p className="mt-1 text-base text-muted-text">
              Leaderboard is frozen for this round
            </p>
          </div>
        ) : isViewingActive && !isViewedRoundLive ? (
          <p className="text-center text-base text-muted-text">
            Waiting for the round to start…
          </p>
        ) : null}

        <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-6">
          <div className="flex flex-col gap-5 lg:gap-6">
            <LivePodium
              key={`podium-${viewingRoundId}-${live.lastScoreEvent?.job_id ?? ''}`}
              participants={viewedParticipants}
              highlightedCompanyId={isViewingActive ? highlightedId : undefined}
            />
            <LiveRanking
              key={`ranking-${viewingRoundId}-${live.lastScoreEvent?.job_id ?? ''}`}
              participants={viewedParticipants}
              highlightedCompanyId={isViewingActive ? highlightedId : undefined}
            />
          </div>

          {isViewingActive ? (
            <ScreenShareStage
              competitionId={competitionId}
              roundId={live.activeRoundId}
              roundStatus={live.roundStatus}
              participants={live.leaderboard}
            />
          ) : (
            <aside className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 text-center text-sm text-muted-text">
              Select the active round to view live screen shares
            </aside>
          )}
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-text">
          <span>Server-authoritative scores · live updates</span>
          <span role="status">
            {live.connected ? 'Live feed connected' : 'Restoring live feed…'}
          </span>
        </footer>
      </div>
    </main>
  );
}
