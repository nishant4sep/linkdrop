'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function useLinkDropSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const client = supabaseBrowser();

    client.auth.getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setAuthError('Could not restore your session. Please sign in again.');
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setAuthError('Could not restore your session. Please sign in again.');
        setLoading(false);
      });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setLoading(false);
      setAuthError(null);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, authError };
}
