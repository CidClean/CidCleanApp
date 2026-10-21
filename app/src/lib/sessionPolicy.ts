/**
 * Duración de la sesión: D-124 (30 días staff, 7 días admins y Super Admin),
 * D-136 (admin = rol de partida Admin o Super Admin), D-146 (la controla la app).
 * Todo aquí es puro: sin red, sin almacenamiento, sin reloj propio.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const STAFF_SESSION_DAYS = 30;
export const ADMIN_SESSION_DAYS = 7;

export type SessionProfile = {
  role: string | null;
  is_super_admin: boolean;
  active: boolean;
};

/** Lo que se sabe del perfil propio al evaluar. */
export type ProfileLookup =
  | { kind: 'found'; profile: SessionProfile }
  | { kind: 'missing' } // la consulta funcionó y no hay perfil
  | { kind: 'unknown' }; // no se pudo consultar (sin red u otro error)

export type SessionVerdict =
  | { valid: true }
  | { valid: false; reason: 'no_start' | 'no_profile' | 'inactive' | 'expired' };

export function isAdminProfile(profile: Pick<SessionProfile, 'role' | 'is_super_admin'>): boolean {
  return profile.role === 'admin' || profile.is_super_admin === true;
}

export function sessionLimitDays(profile: Pick<SessionProfile, 'role' | 'is_super_admin'>): number {
  return isAdminProfile(profile) ? ADMIN_SESSION_DAYS : STAFF_SESSION_DAYS;
}

/** Se supera el límite cuando pasa estrictamente más tiempo que el límite: en el instante exacto aún vale. */
export function isPastLimit(startedAtMs: number, nowMs: number, limitDays: number): boolean {
  return nowMs - startedAtMs > limitDays * DAY_MS;
}

export function evaluateSession(input: {
  startedAtMs: number | null;
  nowMs: number;
  profile: ProfileLookup;
}): SessionVerdict {
  const { startedAtMs, nowMs, profile } = input;

  if (startedAtMs === null || !Number.isFinite(startedAtMs)) {
    return { valid: false, reason: 'no_start' };
  }
  if (profile.kind === 'missing') return { valid: false, reason: 'no_profile' };
  if (profile.kind === 'found' && !profile.profile.active) {
    return { valid: false, reason: 'inactive' };
  }

  // Sin poder consultar el perfil se usa el límite más largo: solo cierra lo que vence en cualquier rol.
  const limitDays =
    profile.kind === 'found' ? sessionLimitDays(profile.profile) : STAFF_SESSION_DAYS;

  return isPastLimit(startedAtMs, nowMs, limitDays)
    ? { valid: false, reason: 'expired' }
    : { valid: true };
}
