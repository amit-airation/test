'use client';

import { useEffect, useState } from 'react';
import type { TimerSnapshot } from '@/lib/competition/types';

function formatClock(totalSeconds: number | null) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '--:--';
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type CountdownProps = {
  timer: TimerSnapshot | null;
  status: string | null;
};

export function Countdown({ timer, status }: CountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!timer?.end_at || !timer?.start_at || status !== 'LIVE') {
      return;
    }

    const clientSnapshotAt = Date.now();
    const serverSnapshotAt = new Date(timer.server_time).getTime();
    const skewMs = clientSnapshotAt - serverSnapshotAt;

    const tick = () => {
      const start = new Date(timer.start_at as string).getTime();
      const end = new Date(timer.end_at as string).getTime();
      const now = Date.now() - skewMs;
      if (now < start) {
        setCountdown(Math.max(0, Math.ceil((start - now) / 1000)));
        setRemaining(timer.duration_seconds);
        return;
      }
      setCountdown(0);
      setRemaining(Math.max(0, Math.ceil((end - now) / 1000)));
    };

    const initialTick = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(id);
    };
  }, [
    timer?.end_at,
    timer?.start_at,
    timer?.server_time,
    timer?.duration_seconds,
    status,
  ]);

  const inCountdown = status === 'LIVE' && countdown != null && countdown > 0;
  const displayedRemaining =
    remaining ?? timer?.time_remaining_seconds ?? null;
  const urgent =
    displayedRemaining != null &&
    displayedRemaining <= 30 &&
    status === 'LIVE' &&
    !inCountdown;

  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-wide text-muted-text">
        {inCountdown ? 'Starting in' : 'Time remaining'}
      </p>
      <p
        className={`mt-1 font-mono font-semibold tabular-nums tracking-tight ${
          inCountdown
            ? 'text-7xl text-primary-accent'
            : urgent
              ? 'text-6xl text-live-danger'
              : 'text-6xl text-foreground'
        }`}
        aria-live="polite"
      >
        {status === 'LIVE'
          ? inCountdown
            ? String(countdown)
            : formatClock(displayedRemaining)
          : formatClock(null)}
      </p>
    </div>
  );
}
