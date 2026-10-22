import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabaseSyncDeps } from './walkthroughApi';
import { loadWalkthrough, onWalkthroughChange, saveWalkthrough, updateWalkthrough } from './walkthroughStore';
import { syncWalkthrough } from './walkthroughSync';
import type { WalkthroughDoc } from './walkthroughRules';

/** Reintento de la cola mientras la pantalla está abierta (D-200: cada 30 s, como los términos sin conexión, D-204). */
const RETRY_MS = 30_000;
/** Espera tras un cambio antes de mandar, para no mandar en cada tecla. */
const DEBOUNCE_MS = 1_500;

/** Documento del walkthrough guardado en el teléfono, con la cola de sincronización corriendo detrás. */
export function useWalkthrough(id: string) {
  const [doc, setDoc] = useState<WalkthroughDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useCallback(() => {
    void syncWalkthrough(id, supabaseSyncDeps);
  }, [id]);

  const scheduleSync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(sync, DEBOUNCE_MS);
  }, [sync]);

  useEffect(() => {
    let cancelled = false;
    void loadWalkthrough(id).then((d) => {
      if (cancelled) return;
      if (d) setDoc(d);
      else setMissing(true);
    });
    const off = onWalkthroughChange((d) => {
      if (d.id === id) setDoc(d);
    });
    sync();
    const interval = setInterval(sync, RETRY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      cancelled = true;
      off();
      clearInterval(interval);
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, sync]);

  const update = useCallback(
    async (change: (d: WalkthroughDoc) => WalkthroughDoc) => {
      const next = await updateWalkthrough(id, change);
      if (next) scheduleSync();
      return next;
    },
    [id, scheduleSync],
  );

  /** Cambio que no hay que mandar al servidor (por ejemplo, el paso en que va la persona). */
  const updateLocal = useCallback(
    async (change: (d: WalkthroughDoc) => WalkthroughDoc) => {
      const current = await loadWalkthrough(id);
      if (!current) return;
      await saveWalkthrough(change(current));
    },
    [id],
  );

  return { doc, missing, update, updateLocal };
}
