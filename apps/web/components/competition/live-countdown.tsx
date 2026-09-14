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

  useEffect(() => {
    if (status !== 'LIVE' || !timer?.end_at) {
      return;
    }

    const clientSnapshotAt = Date.now();
    const serverSnapshotAt = new Date(timer.server_time).getTime();
    const clockOffset = clientSnapshotAt - serverSnapshotAt;

    const update = () => {
      const serverNow = Date.now() - clockOffset;
      const endAt = new Date(timer.end_at as string).getTime();
      setRemaining(Math.max(0, Math.ceil((endAt - serverNow) / 1000)));
    };

    const initialUpdate = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 250);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, [status, timer?.end_at, timer?.server_time]);

  const displayedRemaining =
    remaining ?? timer?.time_remaining_seconds ?? 0;
  const urgent = status === 'LIVE' && displayedRemaining <= 30;
  const finished = status === 'ENDED' || status === 'FINALIZED';

  return (
    <div className="text-center" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-text sm:text-sm">
        {finished ? 'Competition status' : 'Time remaining'}
      </p>
      <p
        className={`mt-1 font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-7xl lg:text-8xl ${
          urgent ? 'animate-pulse text-live-danger' : 'text-foreground'
        }`}
      >
        {status === 'FINALIZED'
          ? 'FINAL RESULTS'
          : status === 'ENDED' || (status === 'LIVE' && remaining === 0)
            ? "TIME'S UP"
            : status === 'LIVE'
              ? formatTime(displayedRemaining)
              : 'WAITING'}
      </p>
    </div>
  );
}
