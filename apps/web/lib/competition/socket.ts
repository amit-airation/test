'use client';

import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';
const EVENT_KEY = process.env.NEXT_PUBLIC_EVENT_KEY ?? '';

let socket: Socket | null = null;

export function getCompetitionSocket(): Socket {
  if (!socket || socket.disconnected) {
    socket = io(`${WS_URL}/competition`, {
      auth: { eventKey: EVENT_KEY },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
    });
  }
  return socket;
}

export function joinCompetitionRoom(
  s: Socket,
  competitionId: string,
  companyId?: string,
  displayName?: string,
) {
  return new Promise<void>((resolve) => {
    s.emit(
      'join_competition',
      { competitionId, companyId, displayName },
      () => resolve(),
    );
  });
}

export function leaveCompetitionRoom(s: Socket) {
  return new Promise<void>((resolve) => {
    s.emit('leave_competition', {}, () => resolve());
  });
}

export function joinRoundRoom(
  s: Socket,
  competitionId: string,
  roundId: string,
  companyId?: string,
) {
  return new Promise<void>((resolve) => {
    s.emit('join_round', { competitionId, roundId, companyId }, () => resolve());
  });
}

export function leaveRoundRoom(s: Socket) {
  return new Promise<void>((resolve) => {
    s.emit('leave_round', {}, () => resolve());
  });
}

export function sendHeartbeat(s: Socket, roundId: string) {
  return new Promise<void>((resolve) => {
    s.emit('heartbeat', { roundId }, () => resolve());
  });
}

export function reportScreenShare(s: Socket, sharing: boolean, roundId?: string) {
  return new Promise<void>((resolve) => {
    s.emit('report_screen_share', { sharing, roundId }, () => resolve());
  });
}
