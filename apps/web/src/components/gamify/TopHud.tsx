import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';

// The old floating XP/streak HUD is gone — the new TopBar shows just a small
// streak chip, and the full XP / goal ring / level surface lives on the
// Profile dashboard (T5). This component only keeps the data-bootstrap side
// effect alive so gamify state populates once the session is known. Renders
// nothing.
//
// Kept as a component (not moved into App.tsx) so it can co-locate near other
// gamify components and so the existing import path in App.tsx stays valid
// during the page-by-page migration.
export function TopHud() {
  const fetchFor = useGamify((s) => s.fetchFor);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) void fetchFor(uid);
    })();
  }, [fetchFor]);
  return null;
}
