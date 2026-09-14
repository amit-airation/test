'use client';

import { useEffect, useState } from 'react';

export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggle = async () => {
    if (!document.documentElement.requestFullscreen) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary-accent"
      aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
    >
      {fullscreen ? 'Exit full screen' : 'Full screen'}
    </button>
  );
}
