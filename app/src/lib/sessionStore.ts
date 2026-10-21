import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEY, supabase } from './supabase';
import { evaluateSession, type ProfileLookup, type SessionVerdict } from './sessionPolicy';

const START_KEY = 'cidclean-session-started-at';

export async function saveSessionStart(nowMs: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(START_KEY, String(nowMs));
}

export async function readSessionStart(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(START_KEY);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function clearSessionStart(): Promise<void> {
  await AsyncStorage.removeItem(START_KEY);
}

/** Consulta el propio perfil (las reglas por fila permiten leerlo con auth.uid()). */
export async function fetchOwnProfile(authUserId: string): Promise<ProfileLookup> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, is_super_admin, active')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (error) return { kind: 'unknown' };
    if (!data) return { kind: 'missing' };
    return {
      kind: 'found',
      profile: { role: data.role, is_super_admin: data.is_super_admin, active: data.active },
    };
  } catch {
    return { kind: 'unknown' };
  }
}

export type SessionCheck =
  | { status: 'in' }
  | { status: 'out'; ended: boolean };

/**
 * Se llama al abrir la app y al volver a primer plano.
 * Si hay sesión y se superó el límite, o el perfil está inactivo o no existe, la cierra.
 */
export async function checkSession(nowMs: number = Date.now()): Promise<SessionCheck> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const startedAtMs = await readSessionStart();

  if (!session) {
    // Había una fecha de inicio pero ya no hay sesión: la sesión terminó (D-151). Sin fecha: primera vez.
    const ended = startedAtMs !== null;
    if (ended) await clearSessionStart();
    return { status: 'out', ended };
  }

  const profile = await fetchOwnProfile(session.user.id);
  const verdict: SessionVerdict = evaluateSession({ startedAtMs, nowMs, profile });
  if (verdict.valid) return { status: 'in' };

  await endSession();
  return { status: 'out', ended: true };
}

/** Cierra solo este dispositivo (scope local: no toca las sesiones de otros teléfonos de la misma persona). */
export async function endSession(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) await AsyncStorage.removeItem(AUTH_STORAGE_KEY); // sin red: se borra la sesión guardada
  } catch {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }
  await clearSessionStart();
}
