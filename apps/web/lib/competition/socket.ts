'use client';

import { io, type Socket } from 'socket.io-client';
import { CLIENT_WS_ACTIONS } from './types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

let sharedSocket: Socket | null = null;

export function getCompetitionSocket(token: string): Socket {
  if (sharedSocket?.connected) {
    return sharedSocket;
  }

  sharedSocket = io(`${WS_URL}/competition`, {
    autoConnect: true,
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  return sharedSocket;
}

export function disconnectCompetitionSocket() {
  sharedSocket?.disconnect();
  sharedSocket = null;
}

export function joinCompetitionRoom(socket: Socket, competitionId: string) {
  return socket.emitWithAck(CLIENT_WS_ACTIONS.JOIN_COMPETITION, {
    competitionId,
  });
}

export function leaveCompetitionRoom(socket: Socket) {
  return socket.emitWithAck(CLIENT_WS_ACTIONS.LEAVE_COMPETITION, {});
}

export function sendHeartbeat(socket: Socket, competitionId: string) {
  return socket.emitWithAck(CLIENT_WS_ACTIONS.HEARTBEAT, { competitionId });
}

export function reportScreenShare(socket: Socket, sharing: boolean) {
  return socket.emitWithAck(CLIENT_WS_ACTIONS.REPORT_SCREEN_SHARE, { sharing });
}

export function joinParticipantRoom(
  socket: Socket,
  competitionId: string,
  participantId: string,
) {
  return socket.emitWithAck(CLIENT_WS_ACTIONS.JOIN_PARTICIPANT_ROOM, {
    competitionId,
    participantId,
  });
}
