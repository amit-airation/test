export const WS_EVENTS = {
  COMPETITION_STATE: 'COMPETITION_STATE',
  ACTIVE_ROUND_CHANGED: 'ACTIVE_ROUND_CHANGED',
  ROUND_STARTED: 'ROUND_STARTED',
  ROUND_ENDED: 'ROUND_ENDED',
  ROUND_FINALIZED: 'ROUND_FINALIZED',
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
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export const CLIENT_WS_ACTIONS = {
  JOIN_COMPETITION: 'join_competition',
  LEAVE_COMPETITION: 'leave_competition',
  JOIN_ROUND: 'join_round',
  LEAVE_ROUND: 'leave_round',
  HEARTBEAT: 'heartbeat',
  REPORT_SCREEN_SHARE: 'report_screen_share',
} as const;

export type TimerSnapshot = {
  round_id: string;
  status: string;
  phase?: 'idle' | 'countdown' | 'running' | 'ended';
  server_time: string;
  start_at: string | null;
  end_at: string | null;
  duration_seconds: number;
  countdown_to_start_seconds?: number | null;
  time_remaining_seconds: number | null;
};

export type LeaderboardEntry = {
  rank: number;
  company_id: string;
  company_name: string;
  score: number;
  status?: string;
  last_scored_at?: string | null;
  score_reached_at?: string | null;
};

export type ScoreUpdatedEvent = {
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

export type LeaderboardUpdatedEvent = {
  event: typeof WS_EVENTS.LEADERBOARD_UPDATED;
  competition_id: string;
  round_id: string;
  status: string;
  timer: TimerSnapshot;
  participants: LeaderboardEntry[];
};

export type RoundInfo = {
  id: string;
  name: string | null;
  round_number: number;
  status: string;
  timer?: TimerSnapshot | null;
};

export type ActiveRoundChangedEvent = {
  event: typeof WS_EVENTS.ACTIVE_ROUND_CHANGED;
  competition_id: string;
  active_round_id: string | null;
  round: RoundInfo | null;
};

export type CompetitionStateEvent = {
  event: typeof WS_EVENTS.COMPETITION_STATE;
  competition_id: string;
  status: string;
  active_round_id: string | null;
  round: RoundInfo | null;
  rounds: Array<{ id: string; round_number: number; name: string | null; status: string }>;
};

export type RecentJob = {
  id: string;
  title: string;
  publishedAt: string;
  postDurationSeconds: number | null;
};
