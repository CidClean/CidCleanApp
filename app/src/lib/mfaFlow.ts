import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Segundo paso del Super Admin (D-306): después del código por correo, un código de 6 dígitos de una app de
 * autenticación (TOTP de Supabase Auth). Solo el Super Admin; los demás entran como siempre. En la base,
 * is_super_admin() solo vale con una sesión aal2. Sin dependencias de React Native, para probarlo desde Node.
 * Si se pierde el teléfono, el factor se borra desde el panel de Supabase (current/arquitectura.md).
 */

export type MfaStep = 'enroll' | 'verify';

type Aal = string | null | undefined;

/** Qué pantalla toca: null (entra), 'enroll' (inscribir la app) o 'verify' (pedir el código de la app). */
export function mfaStep(isSuperAdmin: boolean, aal: { currentLevel: Aal; nextLevel: Aal } | null): MfaStep | null {
  if (!isSuperAdmin) return null;
  if (aal?.currentLevel === 'aal2') return null;
  return aal?.nextLevel === 'aal2' ? 'verify' : 'enroll';
}

type FactorLike = { id: string; factor_type?: string; status?: string };

/** El factor TOTP verificado (el que pide el código), o null. */
export function verifiedTotp(factors: readonly FactorLike[]): FactorLike | null {
  return factors.find((f) => f.factor_type === 'totp' && f.status === 'verified') ?? null;
}

/** Factores TOTP a medio inscribir (se borran antes de empezar otra inscripción). */
export function unverifiedTotp(factors: readonly FactorLike[]): FactorLike[] {
  return factors.filter((f) => f.factor_type === 'totp' && f.status !== 'verified');
}

/** El SVG del QR que devuelve Supabase viene como data URI; para dibujarlo en Android hace falta el XML. */
export function svgFromDataUri(qr: string): string {
  const i = qr.indexOf(',');
  if (!qr.startsWith('data:') || i < 0) return qr;
  const body = qr.slice(i + 1);
  return /;base64,/.test(qr.slice(0, i + 1)) ? atob(body) : decodeURIComponent(body);
}

/** La clave en grupos de 4 para copiarla a mano. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

export function isSixDigits(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export type MfaFailure = 'invalid' | 'network' | 'rate_limit';

type AuthLikeError = { name?: string; message?: string; status?: number; code?: string };

export function mfaFailure(error: AuthLikeError): MfaFailure {
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limit';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status === undefined || (error.status ?? 0) >= 500) {
    return 'network';
  }
  return 'invalid';
}

/** Nivel de la sesión actual (se lee del JWT guardado, sin red). */
export async function readAal(client: SupabaseClient): Promise<{ currentLevel: Aal; nextLevel: Aal } | null> {
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
  } catch {
    return null;
  }
}

export type EnrollStart =
  | { ok: true; factorId: string; qrSvg: string; secret: string }
  | { ok: false; reason: MfaFailure };

/** Empieza la inscripción: borra lo que haya quedado a medias y pide un factor TOTP nuevo (QR + clave). */
export async function startEnroll(client: SupabaseClient, friendlyName = 'Cid Clean'): Promise<EnrollStart> {
  try {
    const list = await client.auth.mfa.listFactors();
    if (list.error) return { ok: false, reason: mfaFailure(list.error) };
    for (const f of unverifiedTotp((list.data?.all ?? []) as FactorLike[])) {
      await client.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (error || !data) return { ok: false, reason: error ? mfaFailure(error) : 'network' };
    return { ok: true, factorId: data.id, qrSvg: svgFromDataUri(data.totp.qr_code), secret: data.totp.secret };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** El factor verificado del Super Admin (para la pantalla del código). */
export async function findVerifiedFactor(client: SupabaseClient): Promise<{ ok: true; factorId: string } | { ok: false; reason: MfaFailure }> {
  try {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) return { ok: false, reason: mfaFailure(error) };
    const f = verifiedTotp((data?.totp ?? data?.all ?? []) as FactorLike[]);
    return f ? { ok: true, factorId: f.id } : { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Confirma el código de 6 dígitos (inscripción o entrada). Si sale bien, la sesión pasa a aal2. */
export async function confirmTotp(client: SupabaseClient, factorId: string, code: string): Promise<{ ok: true } | { ok: false; reason: MfaFailure }> {
  if (!isSixDigits(code)) return { ok: false, reason: 'invalid' };
  try {
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? { ok: false, reason: mfaFailure(error) } : { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
