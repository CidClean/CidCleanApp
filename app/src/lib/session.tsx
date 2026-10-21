import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { checkSession } from './sessionStore';
import { supabase } from './supabase';

type SessionState = {
  /** 'loading' hasta la primera comprobación. */
  status: 'loading' | 'in' | 'out';
  /** Hay que mostrar el aviso "Tu sesión terminó" (D-151). */
  ended: boolean;
  /** Vuelve a comprobar la sesión (tras iniciar sesión, al abrir y al volver a primer plano). */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [ended, setEnded] = useState(false);
  const running = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    // Una sola comprobación a la vez.
    if (running.current) return running.current;
    const job = (async () => {
      try {
        const result = await checkSession();
        setStatus(result.status);
        if (result.status === 'out') {
          // Una comprobación "sin motivo" no borra un aviso que ya se está mostrando.
          setEnded((prev) => prev || result.ended);
        } else {
          setEnded(false);
        }
      } finally {
        running.current = null;
      }
    })();
    running.current = job;
    return job;
  }, []);

  // Al abrir la app y al volver a primer plano (D-124, D-146).
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Si la sesión se cierra por otro lado (otra pestaña, Supabase), la pantalla se entera.
  // No se escucha SIGNED_IN a propósito: la fecha de inicio se guarda justo después de verificar el código.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Se difiere: Supabase no permite llamarlo de vuelta dentro del propio callback.
      if (event === 'SIGNED_OUT') setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(() => ({ status, ended, refresh }), [status, ended, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
