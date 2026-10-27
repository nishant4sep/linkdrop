'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * "Here right now" — a REAL live counter powered by Supabase Realtime
 * presence: it counts the visitors with an open tab on this page, live.
 * When Realtime is unavailable it renders nothing at all — LinkDrop never
 * displays a fabricated viewer count.
 */
export function LivePresence() {
  const [hereNow, setHereNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const client = supabaseBrowser();
    const channel = client.channel('linkdrop-site-presence');
    channel.on('presence', { event: 'sync' }, () => {
      if (!alive) return;
      const state = channel.presenceState();
      setHereNow(Object.keys(state).length);
    });
    channel.subscribe((status) => {
      if (alive && status === 'SUBSCRIBED') {
        const identity = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `vi-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        void channel.track({ identity });
      }
      // Timeline of other statuses (CHANNEL_ERROR, TIMED_OUT…) silently keeps
      // `hereNow === null`, which suppresses the component entirely.
    });
    return () => {
      alive = false;
      void client.removeChannel(channel);
    };
  }, []);

  // Need at least a working connections count; hide otherwise.
  if (hereNow === null || hereNow < 1) return null;

  return (
    <p className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-linkdrop-muted">
      <span className="relative grid h-2.5 w-2.5 place-items-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-linkdrop-forest opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-linkdrop-forest" />
      </span>
      {hereNow.toLocaleString('en-US')} {hereNow === 1 ? 'person' : 'people'} here right now · live
    </p>
  );
}
