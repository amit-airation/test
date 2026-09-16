'use client';

import { useEffect, useState } from 'react';
import type { TimerSnapshot } from '@/lib/competition/types';

type LiveCountdownProps = {
  timer: TimerSnapshot | null;
  status: string | null;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function LiveCountdown({ timer, status }: LiveCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'LIVE' || !timer?.start_at || !timer?.end_at) {
      setRemaining(null);
      setCountdown(null);
      return;
    }

    const clientSnapshotAt = Date.now();
    const serverSnapshotAt = new Date(timer.server_time).getTime();
    const clockOffset = clientSnapshotAt - serverSnapshotAt;

    const update = () => {
      const serverNow = Date.now() - clockOffset;
      const startAt = new Date(timer.start_at as string).getTime();
      const endAt = new Date(timer.end_at as string).getTime();
      if (serverNow < startAt) {
        setCountdown(Math.max(0, Math.ceil((startAt - serverNow) / 1000)));
        setRemaining(timer.duration_seconds);
        return;
      }
      setCountdown(0);
      setRemaining(Math.max(0, Math.ceil((endAt - serverNow) / 1000)));
    };

    const initialUpdate = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 250);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, [
    status,
    timer?.start_at,
    timer?.end_at,
    timer?.server_time,
    timer?.duration_seconds,
  ]);

  const inCountdown =
    status === 'LIVE' && countdown != null && countdown > 0;
  const displayedRemaining =
    remaining ?? timer?.time_remaining_seconds ?? 0;
  const urgent =
    status === 'LIVE' && !inCountdown && displayedRemaining <= 30;
  const finished = status === 'ENDED' || status === 'FINALIZED';

  return (
    <div className="text-center" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-text sm:text-sm">
        {finished
          ? 'Competition status'
          : inCountdown
            ? 'Starting in'
            : 'Time remaining'}
      </p>
      <p
        className={`mt-1 font-mono font-semibold tabular-nums tracking-tight ${
          inCountdown
            ? 'text-8xl text-primary-accent sm:text-9xl'
            : urgent
              ? 'animate-pulse text-5xl text-live-danger sm:text-7xl lg:text-8xl'
              : 'text-5xl text-foreground sm:text-7xl lg:text-8xl'
        }`}
      >
        {status === 'FINALIZED'
          ? 'FINAL RESULTS'
          : status === 'ENDED' ||
              (status === 'LIVE' && !inCountdown && remaining === 0)
            ? "TIME'S UP"
            : inCountdown
              ? String(countdown)
              : status === 'LIVE'
                ? formatTime(displayedRemaining)
                : 'WAITING'}
      </p>
    </div>
  );
}
