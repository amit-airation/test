'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {
  fetchScreenShareStatus,
  fetchScreenShareToken,
} from '@/lib/competition/api';
import { reportScreenShare } from '@/lib/competition/socket';

type ScreenShareControlsProps = {
  competitionId: string;
  roundId: string | null;
  roundStatus: string | null;
  participantStatus?: string | null;
  companyId?: string | null;
  companyName?: string;
  socket: Socket | null;
};

type ShareState =
  | 'checking'
  | 'unavailable'
  | 'idle'
  | 'requesting'
  | 'sharing'
  | 'denied'
  | 'error';

export function ScreenShareControls({
  competitionId,
  roundId,
  roundStatus,
  participantStatus,
  companyId,
  companyName = 'Participant',
  socket,
}: ScreenShareControlsProps) {
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<ShareState>('checking');
  const [message, setMessage] = useState<string | null>(null);

  const disqualified = participantStatus === 'DISQUALIFIED';
  const shareBlocked =
    roundStatus === 'ENDED' ||
    roundStatus === 'FINALIZED' ||
    roundStatus === 'CANCELLED';

  useEffect(() => {
    if (!roundId) {
      setState('unavailable');
      return;
    }
    let cancelled = false;
    void fetchScreenShareStatus(competitionId, roundId)
      .then((result) => {
        if (!cancelled) setState(result.configured ? 'idle' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => { cancelled = true; };
  }, [competitionId, roundId]);

  useEffect(() => {
    if (shareBlocked || disqualified) {
      void stopSharing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareBlocked, disqualified]);

  useEffect(() => {
    return () => { void stopSharing(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopSharing = async (audit: boolean) => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch { /* already stopped */ }
      room.disconnect();
    }
    if (audit && socket && roundId) {
      void reportScreenShare(socket, false, roundId);
    }
  };

  const startSharing = async () => {
    if (!roundId || shareBlocked) return;
    setMessage(null);
    setState('requesting');
    try {
      const creds = await fetchScreenShareToken(
        competitionId,
        roundId,
        'publish',
        companyId ?? undefined,
        companyName,
      );
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (next) => {
        if (next === ConnectionState.Reconnecting) setMessage('Reconnecting screen share…');
        if (next === ConnectionState.Connected) setMessage(null);
        if (next === ConnectionState.Disconnected && roomRef.current === room) {
          setState((s) => (s === 'sharing' ? 'idle' : s));
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) {
          setState('idle');
          if (socket && roundId) void reportScreenShare(socket, false, roundId);
        }
      });

      await room.connect(creds.url, creds.token, {
        peerConnectionTimeout: 20_000,
      });
      await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      setState('sharing');
      if (socket && roundId) void reportScreenShare(socket, true, roundId);
    } catch (error) {
      await stopSharing(false);
      const text = error instanceof Error ? error.message : 'Screen share failed';
      if (/denied|NotAllowed|Permission/i.test(text)) {
        setState('denied');
        setMessage('Screen share permission was denied.');
        return;
      }
      if (/unavailable/i.test(text)) { setState('unavailable'); return; }
      setState('error');
      if (/negotiation|timeout|ICE|WebSocket/i.test(text)) {
        setMessage(
          'Screen share could not connect (WebRTC). Check LIVEKIT_URL / LIVEKIT_PUBLIC_URL / API key in .env, and that browsers can reach LiveKit Cloud.',
        );
        return;
      }
      setMessage(text);
    }
  };

  if (state === 'checking' || state === 'unavailable') return null;

  if (disqualified) {
    return (
      <p className="text-sm text-live-danger" role="status">
        Screen sharing is disabled after disqualification.
      </p>
    );
  }

  if (shareBlocked) {
    return (
      <p className="text-sm text-muted-text" role="status">
        Screen sharing is not available after the round has ended.
      </p>
    );
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      {state === 'sharing' ? (
        <p className="text-sm font-medium text-foreground" role="status">
          Your screen is being shared with competition observers.
        </p>
      ) : (
        <p className="text-sm text-muted-text">
          Share your screen with observers. You can start before the round goes
          live. This never affects your score.
        </p>
      )}
      {message ? (
        <p className="text-sm text-warning" role="alert">{message}</p>
      ) : null}
      {state === 'denied' ? (
        <p className="text-sm text-live-danger" role="alert">
          Browser permission is required to share your screen.
        </p>
      ) : null}
      <div className="flex gap-3">
        {state === 'sharing' ? (
          <button
            type="button"
            onClick={() => { void stopSharing(true); setState('idle'); }}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
          >
            Stop sharing
          </button>
        ) : (
          <button
            type="button"
            disabled={state === 'requesting'}
            onClick={() => void startSharing()}
            className="rounded-xl bg-primary-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {state === 'requesting' ? 'Requesting permission…' : 'Share screen'}
          </button>
        )}
      </div>
    </section>
  );
}
