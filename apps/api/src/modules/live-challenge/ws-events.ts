export const WS_EVENTS = {
  COMPETITION_STARTED: 'COMPETITION_STARTED',
  COMPETITION_STATE: 'COMPETITION_STATE',
  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_CONNECTED: 'PARTICIPANT_CONNECTED',
  PARTICIPANT_DISCONNECTED: 'PARTICIPANT_DISCONNECTED',
  PARTICIPANT_DISQUALIFIED: 'PARTICIPANT_DISQUALIFIED',
  SESSION_SUPERSEDED: 'SESSION_SUPERSEDED',
  JOB_PUBLISHED: 'JOB_PUBLISHED',
  SCORE_UPDATED: 'SCORE_UPDATED',
  LEADERBOARD_UPDATED: 'LEADERBOARD_UPDATED',
  RANK_CHANGED: 'RANK_CHANGED',
  TIME_WARNING: 'TIME_WARNING',
  COMPETITION_ENDED: 'COMPETITION_ENDED',
  COMPETITION_FINALIZED: 'COMPETITION_FINALIZED',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export type TimerSnapshotPayload = {
  competition_id: string;
  status: string;
  server_time: string;
  start_at: string | null;
  end_at: string | null;
  duration_seconds: number;
  time_remaining_seconds: number | null;
};

export type ScoreUpdatedPayload = {
  event: typeof WS_EVENTS.SCORE_UPDATED;
  competition_id: string;
  participant: {
    id: string;
    user_id: string;
    name: string;
  };
  score: number;
  previous_score: number;
  rank: number | null;
  job_id: string;
};

export type LeaderboardUpdatedPayload = {
  event: typeof WS_EVENTS.LEADERBOARD_UPDATED;
  competition_id: string;
  status: string;
  timer: TimerSnapshotPayload;
  participants: Array<{
    rank: number;
    user_id: string;
    name: string;
    score: number;
    status: string;
  }>;
};

export type CompetitionLifecyclePayload = {
  event: string;
  competition_id: string;
  status: string;
  timer?: TimerSnapshotPayload;
  winner_user_id?: string | null;
};

export const CLIENT_WS_ACTIONS = {
  JOIN_COMPETITION: 'join_competition',
  LEAVE_COMPETITION: 'leave_competition',
  JOIN_PARTICIPANT_ROOM: 'join_participant_room',
  HEARTBEAT: 'heartbeat',
  REPORT_SCREEN_SHARE: 'report_screen_share',
} as const;
