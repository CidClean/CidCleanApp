import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { AppState } from 'react-native';

import { selectLocale, type Locale } from '@/i18n';
import { readRememberedLanguage, rememberLanguage } from '@/i18n/languageStore';

import { checkSession } from './sessionStore';
import { supabase } from './supabase';

type SessionState = {
  /** 'loading' hasta la primera comprobación. */
  status: 'loading' | 'in' | 'out';
  /** Hay que mostrar el aviso "Tu sesión terminó" (D-151). */
  ended: boolean;
  /** Vuelve a comprobar la sesión (tras iniciar sesión, al abrir y al volver a primer plano). */
  refresh: () => Promise<void>;
  /** Idioma vigente: el del teléfono antes de iniciar sesión, el del perfil después (D-087, D-159b). */
  locale: Locale;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [ended, setEnded] = useState(false);
  const [profileLanguage, setProfileLanguage] = useState<Locale | null>(null);
  const [remembered, setRemembered] = useState<Locale | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    // Una sola comprobación a la vez.
    if (running.current) return running.current;
    const job = (async () => {
      try {
        const result = await checkSession();
        if (result.status === 'in') {
          if (result.language) {
            setProfileLanguage(result.language);
            setRemembered(result.language);
            void rememberLanguage(result.language);
          } else {
            // No se pudo leer el perfil (sin red): se usa el último idioma recordado.
            setProfileLanguage(null);
          }
        } else {
          setProfileLanguage(null);
        }
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

  // Último idioma del perfil, guardado en una apertura anterior.
  useEffect(() => {
    readRememberedLanguage().then((value) => setRemembered((prev) => prev ?? value));
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

  const deviceLanguageCode = getLocales()[0]?.languageCode ?? null;
  const locale = selectLocale({
    signedIn: status === 'in',
    profileLanguage,
    rememberedLanguage: remembered,
    deviceLanguageCode,
  });

  const value = useMemo(() => ({ status, ended, refresh, locale }), [status, ended, refresh, locale]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
