import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { selectLocale, type Locale } from '@/i18n';
import { readRememberedLanguage, rememberLanguage } from '@/i18n/languageStore';
import { checkSession, endSession, type OwnProfile } from './sessionStore';
import { nextTermsGate, type TermsGate } from './terms';
import { supabase } from './supabase';
import type { Access } from './visibility';

type SessionState = {
  /** 'loading' hasta la primera comprobación. */
  status: 'loading' | 'in' | 'out';
  /** Hay que mostrar el aviso "Tu sesión terminó" (D-151). */
  ended: boolean;
  /** Vuelve a comprobar la sesión (tras iniciar sesión, al abrir y al volver a primer plano). */
  refresh: () => Promise<void>;
  /** Idioma vigente: el del teléfono antes de iniciar sesión, el del perfil después (D-087, D-159b). */
  locale: Locale;
  /** Perfil propio (null antes de iniciar sesión o si aún no se pudo leer). */
  profile: OwnProfile | null;
  /** Permisos del perfil y si es Super Admin (D-169). */
  access: Access;
  /** Falta aceptar los términos del staff (D-168): hasta aceptar no hay otras rutas. */
  termsPending: boolean;
  /** No se pudieron revisar los términos y quien entra no es Super Admin (D-179): no entra hasta que haya conexión. */
  termsOffline: boolean;
  /** Cambia el idioma del perfil (RPC set_my_language, D-087). Devuelve false si no se pudo guardar. */
  setLanguage: (locale: Locale) => Promise<boolean>;
  /** Cierra la sesión de este dispositivo a pedido de la persona (D-167): vuelve al correo sin el aviso. */
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

const NO_ACCESS: Access = { isSuperAdmin: false, permissions: new Set() };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [ended, setEnded] = useState(false);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [terms, setTerms] = useState<TermsGate>('enter');
  const termsRef = useRef<TermsGate | null>(null);
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
          // Si no se pudo leer el perfil (sin red) se conserva lo último que se sabía.
          if (result.profile) {
            setProfile(result.profile);
            setProfileLanguage(result.profile.language);
            if (result.profile.language) {
              setRemembered(result.profile.language);
              void rememberLanguage(result.profile.language);
            }
            if (result.permissions) setPermissions(result.permissions);
          }
          // Los términos se revisan al entrar (D-179): sin red al abrir no se entra; ya dentro, se conserva lo sabido.
          const gate = nextTermsGate(termsRef.current, result.terms);
          termsRef.current = gate;
          setTerms(gate);
          setEnded(false);
        } else {
          setProfile(null);
          setPermissions([]);
          termsRef.current = null;
          setTerms('enter');
          setProfileLanguage(null);
          // Una comprobación "sin motivo" no borra un aviso que ya se está mostrando.
          setEnded((prev) => prev || result.ended);
        }
        setStatus(result.status);
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

  const setLanguage = useCallback(async (next: Locale) => {
    try {
      const { error } = await supabase.rpc('set_my_language', { lang: next });
      if (error) return false;
    } catch {
      return false;
    }
    setProfileLanguage(next);
    setRemembered(next);
    setProfile((p) => (p ? { ...p, language: next } : p));
    void rememberLanguage(next);
    return true;
  }, []);

  const signOut = useCallback(async () => {
    setEnded(false);
    await endSession(); // borra la sesión y la fecha de inicio: no queda marca de "sesión terminada"
    setProfile(null);
    setPermissions([]);
    termsRef.current = null;
    setTerms('enter');
    setProfileLanguage(null);
    setStatus('out');
  }, []);

  const deviceLanguageCode = getLocales()[0]?.languageCode ?? null;
  const locale = selectLocale({
    signedIn: status === 'in',
    profileLanguage,
    rememberedLanguage: remembered,
    deviceLanguageCode,
  });

  const access = useMemo<Access>(
    () => (profile ? { isSuperAdmin: profile.isSuperAdmin, permissions: new Set(permissions) } : NO_ACCESS),
    [profile, permissions],
  );

  const termsPending = terms === 'accept';
  const termsOffline = terms === 'offline';
  const value = useMemo(
    () => ({ status, ended, refresh, locale, profile, access, termsPending, termsOffline, setLanguage, signOut }),
    [status, ended, refresh, locale, profile, access, termsPending, termsOffline, setLanguage, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

/** Permisos del perfil: `can(key)` y las listas de la barra y el Menú (D-169). */
export function usePermissions() {
  const { access } = useSession();
  return useMemo(
    () => ({
      access,
      isSuperAdmin: access.isSuperAdmin,
      can: (key: string) => access.isSuperAdmin || access.permissions.has(key),
    }),
    [access],
  );
}
