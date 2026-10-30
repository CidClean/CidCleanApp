import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLocale, type Locale } from '@/i18n';
import { AUTH_STORAGE_KEY, supabase } from './supabase';
import { evaluateSession, type ProfileLookup, type SessionVerdict } from './sessionPolicy';
import { clearAccountMemory, readAccountMemory, rememberAccount } from './accountMemory';
import { termsGate, type TermsGate, type TermsLookup } from './terms';

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
  /** D-263: "Mis documentos" en el perfil solo para el 1099. */
  workerType: 'w2' | '1099' | null;
};

export async function fetchOwnProfile(
  authUserId: string,
): Promise<{ lookup: ProfileLookup; profile: OwnProfile | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_super_admin, active, language, worker_type')
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
        workerType: data.worker_type === '1099' || data.worker_type === 'w2' ? data.worker_type : null,
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
 * Consulta la última versión publicada de los términos del staff y si este perfil ya la aceptó (D-168).
 * Si no se puede consultar (sin red u otro error) devuelve 'unknown': ya no se deja pasar (D-179).
 */
export async function fetchTermsLookup(profileId: string): Promise<TermsLookup> {
  try {
    const latest = await supabase
      .from('terms_documents')
      .select('id')
      .eq('kind', 'staff')
      .order('version', { ascending: false })
      .limit(1);
    if (latest.error) return { kind: 'unknown' };
    const latestId: string | null = latest.data?.[0]?.id ?? null;
    if (latestId === null) return { kind: 'ok', latestStaffDocumentId: null, acceptedDocumentIds: [] };
    const accepted = await supabase
      .from('terms_acceptances')
      .select('document_id')
      .eq('profile_id', profileId)
      .eq('document_id', latestId);
    if (accepted.error) return { kind: 'unknown' };
    return {
      kind: 'ok',
      latestStaffDocumentId: latestId,
      acceptedDocumentIds: (accepted.data ?? []).map((r: { document_id: string }) => r.document_id),
    };
  } catch {
    return { kind: 'unknown' };
  }
}

export type SessionCheck =
  | {
      status: 'in';
      /** null si no se pudo leer el perfil (sin red). */
      profile: OwnProfile | null;
      permissions: string[] | null;
      /** Qué pantalla toca antes de entrar: entrar, aceptar los términos o pedir conexión (D-179, D-197). */
      terms: TermsGate;
      /** false si no se pudo comprobar con el servidor (sin conexión): quien ya aceptó entró por lo que sabe el teléfono. */
      verified: boolean;
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

  const memory = await readAccountMemory(session.user.id);

  if (!profile) {
    // Sin poder leer el perfil (sin red): entra quien el teléfono sabe que es Super Admin o que ya aceptó los términos (D-197).
    return {
      status: 'in',
      profile: null,
      permissions: null,
      verified: false,
      terms: termsGate({
        isSuperAdmin: memory.isSuperAdmin,
        lookup: { kind: 'unknown' },
        knownAcceptedDocumentId: memory.acceptedTermsId,
      }),
    };
  }

  const permissions = profile.isSuperAdmin ? [] : await fetchOwnPermissions(profile.id);
  const termsLookup: TermsLookup = profile.isSuperAdmin
    ? { kind: 'ok', latestStaffDocumentId: null, acceptedDocumentIds: [] }
    : await fetchTermsLookup(profile.id);
  // Lo comprobado con conexión se guarda: si es Super Admin y qué versión vigente ya aceptó (null si no la ha aceptado).
  await rememberAccount(session.user.id, {
    isSuperAdmin: profile.isSuperAdmin,
    ...(termsLookup.kind === 'ok' && !profile.isSuperAdmin
      ? {
          acceptedTermsId:
            termsLookup.latestStaffDocumentId !== null &&
            termsLookup.acceptedDocumentIds.includes(termsLookup.latestStaffDocumentId)
              ? termsLookup.latestStaffDocumentId
              : null,
        }
      : {}),
  });
  return {
    status: 'in',
    profile,
    permissions,
    verified: termsLookup.kind === 'ok',
    terms: termsGate({
      isSuperAdmin: profile.isSuperAdmin,
      lookup: termsLookup,
      knownAcceptedDocumentId: memory.acceptedTermsId,
    }),
  };
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
  await clearAccountMemory();
}
