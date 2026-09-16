'use client';

import { useEffect, useState } from 'react';
import type { TimerSnapshot } from '@/lib/competition/types';

type StartCountdownProps = {
  timer: TimerSnapshot | null;
  status: string | null;
};

/** Full-bleed 5…4…3…2…1 overlay after round start, before scoring. */
export function StartCountdown({ timer, status }: StartCountdownProps) {
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'LIVE' || !timer?.start_at) {
      setCountdown(null);
      return;
    }

    const clientSnapshotAt = Date.now();
    const serverSnapshotAt = new Date(timer.server_time).getTime();
    const clockOffset = clientSnapshotAt - serverSnapshotAt;

    const update = () => {
      const serverNow = Date.now() - clockOffset;
      const startAt = new Date(timer.start_at as string).getTime();
      const seconds = Math.ceil((startAt - serverNow) / 1000);
      setCountdown(seconds > 0 ? seconds : 0);
    };

    const initial = window.setTimeout(update, 0);
    const id = window.setInterval(update, 200);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [status, timer?.start_at, timer?.server_time]);

  if (status !== 'LIVE' || countdown == null || countdown <= 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-label={`Starting in ${countdown}`}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-text">
        Starting in
      </p>
      <p
        key={countdown}
        className="mt-4 font-mono text-[8rem] font-semibold leading-none text-primary-accent tabular-nums animate-pulse"
      >
        {countdown}
      </p>
    </div>
  );
}
