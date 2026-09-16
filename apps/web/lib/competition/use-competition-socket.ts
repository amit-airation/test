'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  fetchCompetitionSnapshot,
  fetchRoundLeaderboard,
  fetchRoundMe,
} from './api';
import {
  getCompetitionSocket,
  joinCompetitionRoom,
  joinRoundRoom,
  leaveCompetitionRoom,
  sendHeartbeat,
} from './socket';
import {
  WS_EVENTS,
  type ActiveRoundChangedEvent,
  type CompetitionStateEvent,
  type LeaderboardEntry,
  type LeaderboardUpdatedEvent,
  type RecentJob,
  type ScoreUpdatedEvent,
  type TimerSnapshot,
} from './types';

type UseCompetitionSocketOptions = {
  competitionId: string;
  companyId?: string | null;
  companyName?: string;
  enabled?: boolean;
};

export function useCompetitionSocket({
  competitionId,
  companyId,
  companyName,
  enabled = true,
}: UseCompetitionSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const sessionSupersededRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionSuperseded, setSessionSuperseded] = useState(false);

  // Competition-level state
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [competitionStatus, setCompetitionStatus] = useState<string | null>(null);
  const [allRounds, setAllRounds] = useState<
    Array<{ id: string; round_number: number; name: string | null; status: string }>
  >([]);

  // Active round state
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [roundName, setRoundName] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Participant state
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantStatus, setParticipantStatus] = useState<string | null>(null);

  const [lastScoreEvent, setLastScoreEvent] = useState<ScoreUpdatedEvent | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);

  // Tracks which roundId we're currently joined to via WS
  const joinedRoundRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !competitionId) return;

    const socket = getCompetitionSocket();
    socketRef.current = socket;

    const restoreFromHttp = async (roundId: string | null) => {
      try {
        const snapshot = await fetchCompetitionSnapshot(competitionId);
        setCompetitionName(snapshot.name);
        setCompetitionStatus(snapshot.status);
        setAllRounds(
          snapshot.rounds.map((r) => ({
            id: r.id,
            round_number: r.roundNumber,
            name: r.name,
            status: r.status,
          })),
        );

        const effectiveRoundId = roundId ?? snapshot.activeRoundId;
        if (!effectiveRoundId) return;

        const [board, me] = await Promise.all([
          fetchRoundLeaderboard(competitionId, effectiveRoundId),
          companyId
            ? fetchRoundMe(competitionId, effectiveRoundId, companyId).catch(
                () => null,
              )
            : Promise.resolve(null),
        ]);

        setLeaderboard(board.participants);
        setRoundStatus(board.status);
        setTimer(board.timer);

        if (me) {
          setMyScore(me.my_score);
          setMyRank(me.my_rank);
          setParticipantId(me.participant.id);
          setParticipantStatus(me.participant.status);
        }
      } catch {
        // Snapshot restore is best-effort
      }
    };

    const joinRound = async (roundId: string) => {
      if (joinedRoundRef.current === roundId) return;
      joinedRoundRef.current = roundId;
      await joinRoundRoom(socket, competitionId, roundId, companyId ?? undefined);
    };

    const onConnect = async () => {
      sessionSupersededRef.current = false;
      setConnected(true);
      setReconnecting(false);
      setSessionSuperseded(false);

      await restoreFromHttp(null);
      await joinCompetitionRoom(
        socket,
        competitionId,
        companyId ?? undefined,
        companyName,
      );
    };

    const onDisconnect = () => {
      setConnected(false);
      joinedRoundRef.current = null;
      if (!sessionSupersededRef.current) {
        setReconnecting(true);
      }
    };

    const onSessionSuperseded = () => {
      sessionSupersededRef.current = true;
      setSessionSuperseded(true);
      setConnected(false);
      setReconnecting(false);
      socket.io.opts.reconnection = false;
      socket.disconnect();
    };

    const onCompetitionState = async (payload: CompetitionStateEvent) => {
      setCompetitionStatus(payload.status);
      if (payload.rounds) setAllRounds(payload.rounds);
      if (payload.active_round_id) {
        setActiveRoundId(payload.active_round_id);
        if (payload.round) {
          setRoundStatus(payload.round.status);
          setRoundNumber(payload.round.round_number);
          setRoundName(payload.round.name);
          if (payload.round.timer) setTimer(payload.round.timer);
        }
        await joinRound(payload.active_round_id);
      }
    };

    const onActiveRoundChanged = async (payload: ActiveRoundChangedEvent) => {
      const newRoundId = payload.active_round_id;
      setActiveRoundId(newRoundId);

      if (payload.round) {
        setRoundStatus(payload.round.status);
        setRoundNumber(payload.round.round_number);
        setRoundName(payload.round.name);
        if (payload.round.timer) setTimer(payload.round.timer);
      }

      // Reset per-round state
      setMyScore(null);
      setMyRank(null);
      setParticipantId(null);
      setParticipantStatus(null);
      setLeaderboard([]);
      setLastScoreEvent(null);
      setRecentJobs([]);
      joinedRoundRef.current = null;

      if (newRoundId) {
        await restoreFromHttp(newRoundId);
        await joinRound(newRoundId);
      }
    };

    const onRoundLifecycle = (payload: {
      status: string;
      round_id: string;
      timer?: TimerSnapshot;
    }) => {
      if (payload.round_id === activeRoundId || !activeRoundId) {
        setRoundStatus(payload.status);
        if (payload.timer) setTimer(payload.timer);
      }
    };

    const onScoreUpdated = (payload: ScoreUpdatedEvent) => {
      setLastScoreEvent(payload);
      if (companyId && payload.participant.company_id === companyId) {
        setMyScore(payload.score);
        if (payload.rank != null) setMyRank(payload.rank);
      }
    };

    const onJobPublished = (payload: {
      job_id: string;
      company_id: string;
      round_id: string;
      post_duration_seconds: number | null;
    }) => {
      if (companyId && payload.company_id === companyId) {
        setRecentJobs((prev) => {
          if (prev.some((j) => j.id === payload.job_id)) return prev;
          return [
            {
              id: payload.job_id,
              title: 'Published job',
              publishedAt: new Date().toISOString(),
              postDurationSeconds: payload.post_duration_seconds,
            },
            ...prev,
          ].slice(0, 10);
        });
      }
    };

    const onLeaderboardUpdated = (payload: LeaderboardUpdatedEvent) => {
      if (payload.round_id !== joinedRoundRef.current && joinedRoundRef.current) return;
      setLeaderboard(payload.participants);
      setRoundStatus(payload.status);
      setTimer(payload.timer);
      if (companyId) {
        const me = payload.participants.find((p) => p.company_id === companyId);
        if (me) {
          setMyScore(me.score);
          setMyRank(me.rank);
        }
      }
    };

    const onRankChanged = (payload: {
      company_id: string;
      rank: number;
      score: number;
    }) => {
      if (companyId && payload.company_id === companyId) {
        setMyRank(payload.rank);
        setMyScore(payload.score);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(WS_EVENTS.SESSION_SUPERSEDED, onSessionSuperseded);
    socket.on(WS_EVENTS.COMPETITION_STATE, onCompetitionState);
    socket.on(WS_EVENTS.ACTIVE_ROUND_CHANGED, onActiveRoundChanged);
    socket.on(WS_EVENTS.ROUND_STARTED, onRoundLifecycle);
    socket.on(WS_EVENTS.ROUND_ENDED, onRoundLifecycle);
    socket.on(WS_EVENTS.ROUND_FINALIZED, onRoundLifecycle);
    socket.on(WS_EVENTS.SCORE_UPDATED, onScoreUpdated);
    socket.on(WS_EVENTS.JOB_PUBLISHED, onJobPublished);
    socket.on(WS_EVENTS.LEADERBOARD_UPDATED, onLeaderboardUpdated);
    socket.on(WS_EVENTS.RANK_CHANGED, onRankChanged);

    if (socket.connected) {
      void onConnect();
    } else {
      socket.connect();
    }

    const heartbeat = window.setInterval(() => {
      if (socket.connected && joinedRoundRef.current) {
        void sendHeartbeat(socket, joinedRoundRef.current);
      }
    }, 12_000);

    return () => {
      window.clearInterval(heartbeat);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(WS_EVENTS.SESSION_SUPERSEDED, onSessionSuperseded);
      socket.off(WS_EVENTS.COMPETITION_STATE, onCompetitionState);
      socket.off(WS_EVENTS.ACTIVE_ROUND_CHANGED, onActiveRoundChanged);
      socket.off(WS_EVENTS.ROUND_STARTED, onRoundLifecycle);
      socket.off(WS_EVENTS.ROUND_ENDED, onRoundLifecycle);
      socket.off(WS_EVENTS.ROUND_FINALIZED, onRoundLifecycle);
      socket.off(WS_EVENTS.SCORE_UPDATED, onScoreUpdated);
      socket.off(WS_EVENTS.JOB_PUBLISHED, onJobPublished);
      socket.off(WS_EVENTS.LEADERBOARD_UPDATED, onLeaderboardUpdated);
      socket.off(WS_EVENTS.RANK_CHANGED, onRankChanged);
      void leaveCompetitionRoom(socket);
    };
  }, [competitionId, companyId, companyName, enabled]);

  return {
    socketRef,
    connected,
    reconnecting,
    sessionSuperseded,
    competitionName,
    competitionStatus,
    allRounds,
    activeRoundId,
    roundStatus,
    roundNumber,
    roundName,
    timer,
    leaderboard,
    myScore,
    myRank,
    participantId,
    participantStatus,
    lastScoreEvent,
    recentJobs,
  };
}
