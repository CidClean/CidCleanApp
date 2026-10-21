import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLocale, type Locale } from '@/i18n';
import { AUTH_STORAGE_KEY, supabase } from './supabase';
import { evaluateSession, type ProfileLookup, type SessionVerdict } from './sessionPolicy';
import { termsRequired } from './terms';

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

/** Datos del propio perfil que usa la app (las reglas por fila permiten leerlo con auth.uid()). */
export type OwnProfile = {
  id: string;
  fullName: string;
  email: string;
  role: string | null;
  isSuperAdmin: boolean;
  language: Locale | null;
};

export async function fetchOwnProfile(
  authUserId: string,
): Promise<{ lookup: ProfileLookup; profile: OwnProfile | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_super_admin, active, language')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (error) return { lookup: { kind: 'unknown' }, profile: null };
    if (!data) return { lookup: { kind: 'missing' }, profile: null };
    return {
      lookup: {
        kind: 'found',
        profile: { role: data.role, is_super_admin: data.is_super_admin, active: data.active },
      },
      profile: {
        id: data.id,
        fullName: data.full_name,
        email: data.email,
        role: data.role,
        isSuperAdmin: data.is_super_admin,
        language: isLocale(data.language) ? data.language : null,
      },
    };
  } catch {
    return { lookup: { kind: 'unknown' }, profile: null };
  }
}

/** Permisos del propio perfil (profile_permissions). Si no se pueden leer, devuelve null. */
export async function fetchOwnPermissions(profileId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase
      .from('profile_permissions')
      .select('permission_key')
      .eq('profile_id', profileId);
    if (error || !data) return null;
    return data.map((row: { permission_key: string }) => row.permission_key);
  } catch {
    return null;
  }
}

/**
 * ¿Hay que pedir aceptar los términos del staff? (D-168)
 * Si no se puede consultar (sin red) no se bloquea: la aceptación se vuelve a comprobar en la siguiente apertura.
 */
export async function fetchTermsPending(profileId: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return false;
  try {
    const latest = await supabase
      .from('terms_documents')
      .select('id')
      .eq('kind', 'staff')
      .order('version', { ascending: false })
      .limit(1);
    if (latest.error) return false;
    const latestId: string | null = latest.data?.[0]?.id ?? null;
    if (latestId === null) return false;
    const accepted = await supabase
      .from('terms_acceptances')
      .select('document_id')
      .eq('profile_id', profileId)
      .eq('document_id', latestId);
    if (accepted.error) return false;
    return termsRequired({
      isSuperAdmin,
      latestStaffDocumentId: latestId,
      acceptedDocumentIds: (accepted.data ?? []).map((r: { document_id: string }) => r.document_id),
    });
  } catch {
    return false;
  }
}

export type SessionCheck =
  | {
      status: 'in';
      /** null si no se pudo leer el perfil (sin red). */
      profile: OwnProfile | null;
      permissions: string[] | null;
      termsPending: boolean;
    }
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
    // Había una fecha de inicio pero ya no hay sesión: la sesión terminó (D-151). Sin fecha: primera vez o cierre voluntario.
    const ended = startedAtMs !== null;
    if (ended) await clearSessionStart();
    return { status: 'out', ended };
  }

  const { lookup, profile } = await fetchOwnProfile(session.user.id);
  const verdict: SessionVerdict = evaluateSession({ startedAtMs, nowMs, profile: lookup });
  if (!verdict.valid) {
    await endSession();
    return { status: 'out', ended: true };
  }

  if (!profile) return { status: 'in', profile: null, permissions: null, termsPending: false };

  const permissions = profile.isSuperAdmin ? [] : await fetchOwnPermissions(profile.id);
  const termsPending = await fetchTermsPending(profile.id, profile.isSuperAdmin);
  return { status: 'in', profile, permissions, termsPending };
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
