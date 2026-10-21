import { termsRequired } from './terms';

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
