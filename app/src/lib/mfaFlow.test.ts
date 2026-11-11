import type { SupabaseClient } from '@supabase/supabase-js';

import {
  confirmTotp,
  findVerifiedFactor,
  groupSecret,
  isSixDigits,
  mfaFailure,
  mfaStep,
  readAal,
  startEnroll,
  svgFromDataUri,
  unverifiedTotp,
  verifiedTotp,
} from './mfaFlow';

describe('mfaStep (D-306)', () => {
  test('quien no es Super Admin entra sin segundo paso', () => {
    expect(mfaStep(false, { currentLevel: 'aal1', nextLevel: 'aal1' })).toBeNull();
    expect(mfaStep(false, null)).toBeNull();
  });
  test('Super Admin sin factor: inscribir', () => {
    expect(mfaStep(true, { currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('enroll');
  });
  test('Super Admin con factor y solo el código por correo: pedir el código de la app', () => {
    expect(mfaStep(true, { currentLevel: 'aal1', nextLevel: 'aal2' })).toBe('verify');
  });
  test('Super Admin con aal2: entra', () => {
    expect(mfaStep(true, { currentLevel: 'aal2', nextLevel: 'aal2' })).toBeNull();
  });
  test('sin poder leer el nivel, el Super Admin no entra (la regla más estricta)', () => {
    expect(mfaStep(true, null)).not.toBeNull();
  });
});

describe('factores', () => {
  const fs = [
    { id: 'a', factor_type: 'totp', status: 'unverified' },
    { id: 'b', factor_type: 'totp', status: 'verified' },
    { id: 'c', factor_type: 'phone', status: 'verified' },
  ];
  test('el TOTP verificado', () => expect(verifiedTotp(fs)?.id).toBe('b'));
  test('los TOTP a medio inscribir', () => expect(unverifiedTotp(fs).map((f) => f.id)).toEqual(['a']));
  test('sin TOTP verificado', () => expect(verifiedTotp([fs[0], fs[2]])).toBeNull());
});

describe('textos del QR y la clave', () => {
  test('data URI utf-8 a SVG', () => {
    expect(svgFromDataUri('data:image/svg+xml;utf-8,%3Csvg%3E%3C%2Fsvg%3E')).toBe('<svg></svg>');
    expect(svgFromDataUri('data:image/svg+xml;utf-8,<svg></svg>')).toBe('<svg></svg>');
  });
  test('data URI base64 a SVG', () => {
    expect(svgFromDataUri('data:image/svg+xml;base64,' + btoa('<svg/>'))).toBe('<svg/>');
  });
  test('un SVG suelto se deja igual', () => expect(svgFromDataUri('<svg/>')).toBe('<svg/>'));
  test('la clave en grupos de 4', () => expect(groupSecret('ABCDEFGHIJKLMN')).toBe('ABCD EFGH IJKL MN'));
  test('seis dígitos', () => {
    expect(isSixDigits('123456')).toBe(true);
    expect(isSixDigits('12345')).toBe(false);
    expect(isSixDigits('12a456')).toBe(false);
  });
  test('errores', () => {
    expect(mfaFailure({ status: 422, code: 'mfa_verification_failed' })).toBe('invalid');
    expect(mfaFailure({ status: 429 })).toBe('rate_limit');
    expect(mfaFailure({ name: 'AuthRetryableFetchError' })).toBe('network');
  });
});

type Mfa = Record<string, jest.Mock>;
const client = (mfa: Mfa) => ({ auth: { mfa } }) as unknown as SupabaseClient;

describe('llamadas a Supabase Auth', () => {
  test('readAal lee el nivel', async () => {
    const c = client({ getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }) });
    expect(await readAal(c)).toEqual({ currentLevel: 'aal1', nextLevel: 'aal2' });
  });
  test('readAal con error: null', async () => {
    const c = client({ getAuthenticatorAssuranceLevel: jest.fn().mockRejectedValue(new Error('x')) });
    expect(await readAal(c)).toBeNull();
  });
  test('startEnroll borra lo que quedó a medias y devuelve QR y clave', async () => {
    const unenroll = jest.fn().mockResolvedValue({ error: null });
    const enroll = jest.fn().mockResolvedValue({
      data: { id: 'f1', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET', uri: 'otpauth://x' } },
      error: null,
    });
    const c = client({
      listFactors: jest.fn().mockResolvedValue({ data: { all: [{ id: 'viejo', factor_type: 'totp', status: 'unverified' }], totp: [] }, error: null }),
      unenroll,
      enroll,
    });
    expect(await startEnroll(c)).toEqual({ ok: true, factorId: 'f1', qrSvg: '<svg/>', secret: 'SECRET' });
    expect(unenroll).toHaveBeenCalledWith({ factorId: 'viejo' });
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Cid Clean' });
  });
  test('startEnroll sin red', async () => {
    const c = client({ listFactors: jest.fn().mockRejectedValue(new Error('offline')) });
    expect(await startEnroll(c)).toEqual({ ok: false, reason: 'network' });
  });
  test('findVerifiedFactor', async () => {
    const c = client({ listFactors: jest.fn().mockResolvedValue({ data: { all: [], totp: [{ id: 'f9', factor_type: 'totp', status: 'verified' }] }, error: null }) });
    expect(await findVerifiedFactor(c)).toEqual({ ok: true, factorId: 'f9' });
  });
  test('confirmTotp: código correcto', async () => {
    const challengeAndVerify = jest.fn().mockResolvedValue({ data: {}, error: null });
    expect(await confirmTotp(client({ challengeAndVerify }), 'f1', '123456')).toEqual({ ok: true });
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
  });
  test('confirmTotp: código incorrecto', async () => {
    const challengeAndVerify = jest.fn().mockResolvedValue({ data: null, error: { status: 422, code: 'mfa_verification_failed' } });
    expect(await confirmTotp(client({ challengeAndVerify }), 'f1', '000000')).toEqual({ ok: false, reason: 'invalid' });
  });
  test('confirmTotp: sin seis dígitos no llama a Supabase', async () => {
    const challengeAndVerify = jest.fn();
    expect(await confirmTotp(client({ challengeAndVerify }), 'f1', '12')).toEqual({ ok: false, reason: 'invalid' });
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});
