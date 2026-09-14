'use client';

type ConnectionBannerProps = {
  connected: boolean;
  reconnecting: boolean;
  sessionSuperseded?: boolean;
};

export function ConnectionBanner({
  connected,
  reconnecting,
  sessionSuperseded,
}: ConnectionBannerProps) {
  if (sessionSuperseded) {
    return (
      <div
        role="status"
        className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      >
        This live session moved to another tab. Refresh here to take it back.
      </div>
    );
  }

  if (connected && !reconnecting) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      {reconnecting
        ? 'Reconnecting… score and timer will restore automatically.'
        : 'Disconnected from live updates. Retrying…'}
    </div>
  );
}
