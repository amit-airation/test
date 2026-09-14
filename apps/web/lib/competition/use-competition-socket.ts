'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  fetchCompetitionSnapshot,
  fetchLeaderboard,
  fetchMyCompetitionState,
} from './api';
import {
  getCompetitionSocket,
  joinCompetitionRoom,
  leaveCompetitionRoom,
  sendHeartbeat,
} from './socket';
import {
  WS_EVENTS,
  type LeaderboardUpdatedEvent,
  type ScoreUpdatedEvent,
  type TimerSnapshot,
} from './types';

type UseCompetitionSocketOptions = {
  competitionId: string;
  token: string | null;
  userId?: string | null;
  enabled?: boolean;
};

/**
 * Client-only competition realtime hook.
 * On reconnect: HTTP snapshot first, then resume live events.
 */
export function useCompetitionSocket({
  competitionId,
  token,
  userId,
  enabled = true,
}: UseCompetitionSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const sessionSupersededRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionSuperseded, setSessionSuperseded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantStatus, setParticipantStatus] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [externalUserId, setExternalUserId] = useState<string | null | undefined>(
    undefined,
  );
  const [leaderboard, setLeaderboard] = useState<
    LeaderboardUpdatedEvent['participants']
  >([]);
  const [lastScoreEvent, setLastScoreEvent] = useState<ScoreUpdatedEvent | null>(
    null,
  );
  const [recentJobs, setRecentJobs] = useState<
    Array<{ id: string; title: string; publishedAt: string }>
  >([]);

  useEffect(() => {
    if (!enabled || !token || !competitionId) {
      return;
    }

    const socket = getCompetitionSocket(token);
    socketRef.current = socket;

    const restoreFromHttp = async () => {
      try {
        const [snapshot, me, board] = await Promise.all([
          fetchCompetitionSnapshot(competitionId, token),
          fetchMyCompetitionState(competitionId, token).catch(() => null),
          fetchLeaderboard(competitionId, token),
        ]);
        setCompetitionName(snapshot.name);
        setStatus(snapshot.status);
        setTimer(snapshot.timer as TimerSnapshot);
        if (me) {
          setMyScore(me.my_score);
          setMyRank(me.my_rank);
          setTimer(me.timer as TimerSnapshot);
          setParticipantId(me.participant.id);
          setParticipantStatus(me.participant.status);
          setCompanyId(me.participant.companyId);
          setExternalUserId(me.external_user_id);
        }
        setLeaderboard(board.participants);
      } catch {
        // Snapshot restore is best-effort; live events may still arrive.
      }
    };

    const onConnect = async () => {
      sessionSupersededRef.current = false;
      setConnected(true);
      setReconnecting(false);
      setSessionSuperseded(false);
      await restoreFromHttp();
      await joinCompetitionRoom(socket, competitionId);
    };

    const onDisconnect = () => {
      setConnected(false);
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(WS_EVENTS.SESSION_SUPERSEDED, onSessionSuperseded);
    socket.on(
      WS_EVENTS.COMPETITION_STATE,
      (payload: { status: string; timer?: TimerSnapshot }) => {
        setStatus(payload.status);
        if (payload.timer) setTimer(payload.timer);
      },
    );
    socket.on(
      WS_EVENTS.COMPETITION_STARTED,
      (payload: { status: string; timer?: TimerSnapshot }) => {
        setStatus(payload.status);
        if (payload.timer) setTimer(payload.timer);
      },
    );
    socket.on(
      WS_EVENTS.COMPETITION_ENDED,
      (payload: { status: string; timer?: TimerSnapshot }) => {
        setStatus(payload.status);
        if (payload.timer) setTimer(payload.timer);
      },
    );
    socket.on(WS_EVENTS.COMPETITION_FINALIZED, (payload: { status: string }) => {
      setStatus(payload.status);
    });
    socket.on(WS_EVENTS.SCORE_UPDATED, (payload: ScoreUpdatedEvent) => {
      setLastScoreEvent(payload);
      if (userId && payload.participant.user_id === userId) {
        setMyScore(payload.score);
        if (payload.rank != null) setMyRank(payload.rank);
      }
    });
    socket.on(
      WS_EVENTS.JOB_PUBLISHED,
      (payload: {
        job_id: string;
        user_id: string;
        competition_id: string;
      }) => {
        if (userId && payload.user_id === userId) {
          setRecentJobs((prev) => {
            if (prev.some((j) => j.id === payload.job_id)) return prev;
            return [
              {
                id: payload.job_id,
                title: 'Published job',
                publishedAt: new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 10);
          });
        }
      },
    );
    socket.on(
      WS_EVENTS.LEADERBOARD_UPDATED,
      (payload: LeaderboardUpdatedEvent) => {
        setLeaderboard(payload.participants);
        setStatus(payload.status);
        setTimer(payload.timer);
        if (userId) {
          const me = payload.participants.find((p) => p.user_id === userId);
          if (me) {
            setMyScore(me.score);
            setMyRank(me.rank);
          }
        }
      },
    );
    socket.on(
      WS_EVENTS.RANK_CHANGED,
      (payload: { user_id: string; rank: number; score: number }) => {
        if (userId && payload.user_id === userId) {
          setMyRank(payload.rank);
          setMyScore(payload.score);
        }
      },
    );

    if (socket.connected) {
      void onConnect();
    } else {
      socket.connect();
    }

    const heartbeat = window.setInterval(() => {
      if (socket.connected) {
        void sendHeartbeat(socket, competitionId);
      }
    }, 12_000);

    return () => {
      window.clearInterval(heartbeat);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(WS_EVENTS.SESSION_SUPERSEDED, onSessionSuperseded);
      void leaveCompetitionRoom(socket);
    };
  }, [competitionId, token, userId, enabled]);

  const prependRecentJob = (job: {
    id: string;
    title: string;
    publishedAt: string;
  }) => {
    setRecentJobs((prev) => {
      if (prev.some((j) => j.id === job.id)) return prev;
      return [job, ...prev].slice(0, 10);
    });
  };

  return {
    connected,
    reconnecting,
    sessionSuperseded,
    status,
    competitionName,
    timer,
    myScore,
    myRank,
    participantId,
    participantStatus,
    companyId,
    externalUserId,
    setCompanyId,
    leaderboard,
    lastScoreEvent,
    recentJobs,
    prependRecentJob,
    setMyScore,
    setMyRank,
    socket: socketRef,
  };
}
