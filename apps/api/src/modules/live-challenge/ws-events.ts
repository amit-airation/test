export const WS_EVENTS = {
  // Competition-level
  COMPETITION_STATE: 'COMPETITION_STATE',
  ACTIVE_ROUND_CHANGED: 'ACTIVE_ROUND_CHANGED',
  // Round lifecycle
  ROUND_STARTED: 'ROUND_STARTED',
  ROUND_ENDED: 'ROUND_ENDED',
  ROUND_FINALIZED: 'ROUND_FINALIZED',
  // Participant presence
  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_CONNECTED: 'PARTICIPANT_CONNECTED',
  PARTICIPANT_DISCONNECTED: 'PARTICIPANT_DISCONNECTED',
  PARTICIPANT_DISQUALIFIED: 'PARTICIPANT_DISQUALIFIED',
  SESSION_SUPERSEDED: 'SESSION_SUPERSEDED',
  // Scoring
  JOB_PUBLISHED: 'JOB_PUBLISHED',
  SCORE_UPDATED: 'SCORE_UPDATED',
  LEADERBOARD_UPDATED: 'LEADERBOARD_UPDATED',
  RANK_CHANGED: 'RANK_CHANGED',
  TIME_WARNING: 'TIME_WARNING',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export type TimerSnapshotPayload = {
  round_id: string;
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
  round_id: string;
  participant: {
    id: string;
    company_id: string;
    company_name: string;
  };
  score: number;
  previous_score: number;
  rank: number | null;
  job_id: string;
  post_duration_seconds: number | null;
};

export type LeaderboardUpdatedPayload = {
  event: typeof WS_EVENTS.LEADERBOARD_UPDATED;
  competition_id: string;
  round_id: string;
  status: string;
  timer: TimerSnapshotPayload;
  participants: Array<{
    rank: number;
    company_id: string;
    company_name: string;
    score: number;
    status: string;
  }>;
};

export type RoundLifecyclePayload = {
  event: string;
  competition_id: string;
  round_id: string;
  round_number: number;
  status: string;
  timer?: TimerSnapshotPayload;
  winner_company_id?: string | null;
};

export type ActiveRoundChangedPayload = {
  event: typeof WS_EVENTS.ACTIVE_ROUND_CHANGED;
  competition_id: string;
  active_round_id: string | null;
  round: {
    id: string;
    name: string | null;
    round_number: number;
    status: string;
    timer: TimerSnapshotPayload | null;
  } | null;
};

export const CLIENT_WS_ACTIONS = {
  JOIN_COMPETITION: 'join_competition',
  LEAVE_COMPETITION: 'leave_competition',
  JOIN_ROUND: 'join_round',
  LEAVE_ROUND: 'leave_round',
  HEARTBEAT: 'heartbeat',
  REPORT_SCREEN_SHARE: 'report_screen_share',
} as const;
