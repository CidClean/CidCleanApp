import { nextTermsGate, termsGate, termsRequired } from './terms';

describe('termsRequired (D-168)', () => {
  test('sin versión publicada del staff no se pide aceptar', () => {
    expect(termsRequired({ isSuperAdmin: false, latestStaffDocumentId: null, acceptedDocumentIds: [] })).toBe(false);
  });
  test('con versión publicada y sin aceptar: se pide', () => {
    expect(termsRequired({ isSuperAdmin: false, latestStaffDocumentId: 'v1', acceptedDocumentIds: [] })).toBe(true);
  });
  test('con la versión vigente ya aceptada: no se pide', () => {
    expect(termsRequired({ isSuperAdmin: false, latestStaffDocumentId: 'v1', acceptedDocumentIds: ['v1'] })).toBe(false);
  });
  test('versión nueva: se vuelve a pedir aunque haya aceptado la anterior', () => {
    expect(termsRequired({ isSuperAdmin: false, latestStaffDocumentId: 'v2', acceptedDocumentIds: ['v1'] })).toBe(true);
    expect(termsRequired({ isSuperAdmin: false, latestStaffDocumentId: 'v2', acceptedDocumentIds: ['v1', 'v2'] })).toBe(false);
  });
  test('el Super Admin nunca acepta', () => {
    expect(termsRequired({ isSuperAdmin: true, latestStaffDocumentId: 'v1', acceptedDocumentIds: [] })).toBe(false);
  });
});

describe('termsGate: qué pantalla toca antes de entrar (D-168, D-179, D-197)', () => {
  const ok = (latest: string | null, accepted: string[] = []) => ({ kind: 'ok' as const, latestStaffDocumentId: latest, acceptedDocumentIds: accepted });
  const unknown = { kind: 'unknown' as const };

  test('quién debe aceptar: staff con versión publicada sin aceptar', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: ok('v1'), knownAcceptedDocumentId: null })).toBe('accept');
    expect(termsGate({ isSuperAdmin: false, lookup: ok('v2', ['v1']), knownAcceptedDocumentId: 'v1' })).toBe('accept');
  });
  test('quien ya aceptó la versión vigente entra', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: ok('v1', ['v1']), knownAcceptedDocumentId: null })).toBe('enter');
  });
  test('sin versión publicada se entra (no se pide nada)', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: ok(null), knownAcceptedDocumentId: null })).toBe('enter');
  });
  test('el Super Admin siempre entra, con o sin conexión', () => {
    expect(termsGate({ isSuperAdmin: true, lookup: ok('v1'), knownAcceptedDocumentId: null })).toBe('enter');
    expect(termsGate({ isSuperAdmin: true, lookup: unknown, knownAcceptedDocumentId: null })).toBe('enter');
  });
  test('sin conexión: entra quien el teléfono sabe que ya aceptó la versión vigente (D-197)', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: unknown, knownAcceptedDocumentId: 'v1' })).toBe('enter');
    expect(termsGate({ isSuperAdmin: null, lookup: unknown, knownAcceptedDocumentId: 'v1' })).toBe('enter');
  });
  test('sin conexión: quien nunca aceptó o no se sabe no entra (D-197)', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: unknown, knownAcceptedDocumentId: null })).toBe('offline');
    expect(termsGate({ isSuperAdmin: null, lookup: unknown, knownAcceptedDocumentId: null })).toBe('offline');
  });
  test('con conexión manda lo que dice el servidor, no lo que recuerda el teléfono', () => {
    expect(termsGate({ isSuperAdmin: false, lookup: ok('v2', ['v1']), knownAcceptedDocumentId: 'v1' })).toBe('accept');
  });
});

describe('nextTermsGate: los términos se revisan al entrar (D-179, D-197)', () => {
  test('al abrir la app (sin estado previo) un fallo bloquea', () => {
    expect(nextTermsGate(null, 'offline')).toBe('offline');
  });
  test('ya dentro, un fallo posterior al volver a primer plano conserva lo que se sabía', () => {
    expect(nextTermsGate('enter', 'offline')).toBe('enter');
    expect(nextTermsGate('accept', 'offline')).toBe('accept');
  });
  test('si ya estaba bloqueado, sigue bloqueado', () => {
    expect(nextTermsGate('offline', 'offline')).toBe('offline');
  });
  test('con conexión el resultado nuevo manda', () => {
    expect(nextTermsGate('offline', 'enter')).toBe('enter');
    expect(nextTermsGate('offline', 'accept')).toBe('accept');
    expect(nextTermsGate('enter', 'accept')).toBe('accept');
    expect(nextTermsGate('accept', 'enter')).toBe('enter');
  });
});
