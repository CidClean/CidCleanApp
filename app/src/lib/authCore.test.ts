import type { SupabaseClient } from '@supabase/supabase-js';

import { requestCode, verifyCode } from './authCore';

type Err = { name?: string; message?: string; status?: number; code?: string } | null;

function fakeClient(otp: Err | Error, verify: Err | Error = null): SupabaseClient {
  const answer = (e: Err | Error) =>
    e instanceof Error ? Promise.reject(e) : Promise.resolve({ error: e });
  return {
    auth: { signInWithOtp: () => answer(otp), verifyOtp: () => answer(verify) },
  } as unknown as SupabaseClient;
}

describe('requestCode (D-150, sin enumeración)', () => {
  test('correo con acceso: éxito', async () => {
    expect(await requestCode(fakeClient(null), 'a@b.co')).toEqual({ ok: true });
  });
  test('correo sin acceso (registro no permitido): se trata como éxito', async () => {
    const e = { name: 'AuthApiError', status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' };
    expect(await requestCode(fakeClient(e), 'a@b.co')).toEqual({ ok: true });
    expect(await requestCode(fakeClient({ status: 422, message: 'Signups not allowed for otp' }), 'a@b.co')).toEqual({ ok: true });
  });
  test('límite de envíos: error real', async () => {
    const e = { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' };
    expect(await requestCode(fakeClient(e), 'a@b.co')).toEqual({ ok: false, reason: 'rate_limit' });
  });
  test('fallo de red: error real, sin lanzar', async () => {
    const e = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
    expect(await requestCode(fakeClient(e), 'a@b.co')).toEqual({ ok: false, reason: 'network' });
    expect(await requestCode(fakeClient(new Error('boom')), 'a@b.co')).toEqual({ ok: false, reason: 'network' });
  });
});

describe('verifyCode', () => {
  test('código bueno', async () => {
    expect(await verifyCode(fakeClient(null, null), 'a@b.co', '123456')).toEqual({ ok: true });
  });
  test('código incorrecto o vencido', async () => {
    const e = { name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' };
    expect(await verifyCode(fakeClient(null, e), 'a@b.co', '000000')).toEqual({ ok: false, reason: 'invalid' });
  });
  test('sin red', async () => {
    const e = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
    expect(await verifyCode(fakeClient(null, e), 'a@b.co', '000000')).toEqual({ ok: false, reason: 'network' });
  });
});
