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
  token: string;
  status: string | null;
  participantStatus?: string | null;
  socket: Socket | null;
};

type ShareState =
  | 'checking'
  | 'unavailable'
  | 'idle'
  | 'requesting'
  | 'sharing'
  | 'denied'
  | 'error'
  | 'ended';

export function ScreenShareControls({
  competitionId,
  token,
  status,
  participantStatus,
  socket,
}: ScreenShareControlsProps) {
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<ShareState>('checking');
  const [message, setMessage] = useState<string | null>(null);

  const live = status === 'LIVE';
  const disqualified = participantStatus === 'DISQUALIFIED';

  useEffect(() => {
    let cancelled = false;
    void fetchScreenShareStatus(competitionId, token)
      .then((result) => {
        if (!cancelled) {
          setState(result.configured ? 'idle' : 'unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [competitionId, token]);

  useEffect(() => {
    if (!live || disqualified || state === 'ended') {
      void stopSharing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, disqualified]);

  useEffect(() => {
    return () => {
      void stopSharing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopSharing = async (audit: boolean) => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch {
        // already stopped
      }
      room.disconnect();
    }
    if (audit && socket) {
      void reportScreenShare(socket, false);
    }
  };

  const startSharing = async () => {
    setMessage(null);
    setState('requesting');
    try {
      const creds = await fetchScreenShareToken(competitionId, token, 'publish');
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (next) => {
        if (next === ConnectionState.Reconnecting) {
          setMessage('Reconnecting screen share…');
        }
        if (next === ConnectionState.Connected) {
          setMessage(null);
        }
        if (next === ConnectionState.Disconnected && roomRef.current === room) {
          setState((current) => (current === 'sharing' ? 'idle' : current));
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          setState('idle');
          if (socket) void reportScreenShare(socket, false);
        }
      });

      await room.connect(creds.url, creds.token);
      await room.localParticipant.setScreenShareEnabled(true, {
        audio: true,
      });
      setState('sharing');
      if (socket) void reportScreenShare(socket, true);
    } catch (error) {
      await stopSharing(false);
      const text = error instanceof Error ? error.message : 'Screen share failed';
      if (/denied|NotAllowed|Permission/i.test(text)) {
        setState('denied');
        setMessage('Screen share permission was denied.');
        return;
      }
      if (/unavailable/i.test(text)) {
        setState('unavailable');
        return;
      }
      setState('error');
      setMessage(text);
    }
  };

  if (state === 'checking') {
    return null;
  }

  if (state === 'unavailable') {
    return (
      <p className="text-sm text-muted-text" role="status">
        Screen share unavailable.
      </p>
    );
  }

  if (disqualified) {
    return (
      <p className="text-sm text-live-danger" role="status">
        Screen sharing is disabled after disqualification.
      </p>
    );
  }

  if (!live) {
    return (
      <p className="text-sm text-muted-text" role="status">
        Screen sharing is available while the competition is LIVE.
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
          Share your job-creation screen with observers. This never changes
          your score.
        </p>
      )}
      {message ? (
        <p className="text-sm text-warning" role="alert">
          {message}
        </p>
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
            onClick={() => {
              void stopSharing(true);
              setState('idle');
            }}
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
