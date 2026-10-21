import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lógica de entrada sin dependencias de React Native, para poder probarla desde Node.
 * `auth.ts` la une con el cliente real.
 */

export type RequestCodeResult =
  | { ok: true }
  | { ok: false; reason: 'network' | 'rate_limit' };

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'network' | 'rate_limit' };

type AuthLikeError = { name?: string; message?: string; status?: number; code?: string };

const NO_ACCESS_CODES = new Set(['otp_disabled', 'signup_disabled', 'user_not_found']);
const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
]);

/** Supabase dice que el correo no tiene acceso (registro no permitido). D-150: se trata como éxito. */
export function isNoAccessError(error: AuthLikeError): boolean {
  if (error.code && NO_ACCESS_CODES.has(error.code)) return true;
  return /signups? not allowed|user not found/i.test(error.message ?? '');
}

export function isRateLimitError(error: AuthLikeError): boolean {
  return error.status === 429 || (!!error.code && RATE_LIMIT_CODES.has(error.code));
}

export function isNetworkError(error: AuthLikeError): boolean {
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    error.status === undefined ||
    (error.status ?? 0) >= 500
  );
}

/**
 * Pide el código. D-150 (sin enumeración): si el correo no tiene acceso, devuelve éxito igual.
 * Solo devuelve error ante fallo de red o límite de envíos.
 */
export async function requestCode(client: SupabaseClient, email: string): Promise<RequestCodeResult> {
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (!error) return { ok: true };
    if (isNoAccessError(error)) return { ok: true };
    if (isRateLimitError(error)) return { ok: false, reason: 'rate_limit' };
    return { ok: false, reason: 'network' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function verifyCode(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<VerifyCodeResult> {
  try {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (!error) return { ok: true };
    if (isRateLimitError(error)) return { ok: false, reason: 'rate_limit' };
    if (isNetworkError(error)) return { ok: false, reason: 'network' };
    return { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
