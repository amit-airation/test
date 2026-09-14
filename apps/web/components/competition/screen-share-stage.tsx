'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import {
  fetchScreenShareStatus,
  fetchScreenShareToken,
} from '@/lib/competition/api';

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  name: string;
  score: number;
};

type ScreenShareStageProps = {
  competitionId: string;
  token: string;
  status: string | null;
  participants: LeaderboardEntry[];
};

type RemoteScreen = {
  userId: string;
  name: string;
  track: RemoteTrack;
  publication: RemoteTrackPublication;
};

export function ScreenShareStage({
  competitionId,
  token,
  status,
  participants,
}: ScreenShareStageProps) {
  const roomRef = useRef<Room | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [screens, setScreens] = useState<RemoteScreen[]>([]);
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = status === 'LIVE';

  useEffect(() => {
    let cancelled = false;
    void fetchScreenShareStatus(competitionId, token)
      .then((result) => {
        if (!cancelled) setConfigured(result.configured);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [competitionId, token]);

  useEffect(() => {
    if (!configured || !live) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setScreens([]);
      setFocusedUserId(null);
      return;
    }

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const upsert = (next: RemoteScreen) => {
      setScreens((prev) => {
        const without = prev.filter((item) => item.userId !== next.userId);
        return [...without, next];
      });
    };
    const remove = (userId: string) => {
      setScreens((prev) => prev.filter((item) => item.userId !== userId));
      setFocusedUserId((current) => (current === userId ? null : current));
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;
      const userId = userIdFromIdentity(participant.identity);
      if (!userId) return;
      void publication.setVideoQuality(VideoQuality.LOW);
      upsert({
        userId,
        name: participant.name || userId,
        track,
        publication,
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
      const userId = userIdFromIdentity(participant.identity);
      if (userId) remove(userId);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      const userId = userIdFromIdentity(participant.identity);
      if (userId) remove(userId);
    });

    void fetchScreenShareToken(competitionId, token, 'watch')
      .then((creds) => {
        if (cancelled) return;
        return room.connect(creds.url, creds.token);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to watch screens');
        }
      });

    return () => {
      cancelled = true;
      room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [configured, live, competitionId, token]);

  useEffect(() => {
    for (const screen of screens) {
      void screen.publication.setVideoQuality(
        focusedUserId === screen.userId ? VideoQuality.HIGH : VideoQuality.LOW,
      );
    }
  }, [focusedUserId, screens]);

  if (configured === false) {
    return (
      <p className="text-center text-sm text-muted-text" role="status">
        Screen share unavailable.
      </p>
    );
  }

  if (!live) {
    return null;
  }

  if (error) {
    return (
      <p className="text-center text-sm text-warning" role="status">
        {error}
      </p>
    );
  }

  const focused = screens.find((item) => item.userId === focusedUserId) ?? null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground sm:text-2xl">
          Live screens
        </h2>
        {focused ? (
          <button
            type="button"
            onClick={() => setFocusedUserId(null)}
            className="text-sm text-muted-text underline"
          >
            Back to grid
          </button>
        ) : null}
      </div>
      {screens.length === 0 ? (
        <p className="text-sm text-muted-text">
          Waiting for participants to share their screens.
        </p>
      ) : focused ? (
        <FocusTile
          screen={focused}
          participant={participants.find((p) => p.user_id === focused.userId)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {screens.map((screen) => (
            <GridTile
              key={screen.userId}
              screen={screen}
              participant={participants.find((p) => p.user_id === screen.userId)}
              onSelect={() => setFocusedUserId(screen.userId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GridTile({
  screen,
  participant,
  onSelect,
}: {
  screen: RemoteScreen;
  participant?: LeaderboardEntry;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="overflow-hidden rounded-2xl border border-border bg-surface text-left"
    >
      <VideoSurface track={screen.track} muted />
      <div className="px-3 py-2">
        <p className="truncate font-semibold text-foreground">
          {participant?.name ?? screen.name}
        </p>
        <p className="text-sm text-muted-text">
          {participant ? `${participant.score} jobs` : 'Sharing'}
        </p>
      </div>
    </button>
  );
}

function FocusTile({
  screen,
  participant,
}: {
  screen: RemoteScreen;
  participant?: LeaderboardEntry;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
        <p className="text-xl font-semibold text-foreground sm:text-3xl">
          {participant?.name ?? screen.name}
          {participant?.rank ? ` • #${participant.rank}` : ''}
        </p>
        {participant ? (
          <p className="text-lg text-muted-text">{participant.score} jobs</p>
        ) : null}
      </div>
      <VideoSurface track={screen.track} muted={false} tall />
    </div>
  );
}

function VideoSurface({
  track,
  muted,
  tall,
}: {
  track: RemoteTrack;
  muted: boolean;
  tall?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`w-full bg-black object-contain ${tall ? 'min-h-[420px]' : 'aspect-video'}`}
    />
  );
}

function userIdFromIdentity(identity: string) {
  return identity.startsWith('publisher:')
    ? identity.slice('publisher:'.length)
    : null;
}
