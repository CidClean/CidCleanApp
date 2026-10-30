import { LEGAL_URLS, getLegalStrings } from '@/i18n/legal';
import { termsGate } from './terms';

// Orden 56 a 58 (D-282, D-284): textos exactos y enlaces solo en inglés.
describe('legal rev. 3', () => {
  test('aviso de la cámara con el texto exacto de D-284 en cada idioma', () => {
    expect(getLegalStrings('es').cameraNotice).toBe('Fotografía el trabajo, no a las personas. Uso exclusivo de administración.');
    expect(getLegalStrings('en').cameraNotice).toBe('Photograph the work, not people. For administration use only.');
  });

  test('los textos legales enlazan solo a la versión en inglés', () => {
    expect(LEGAL_URLS).toEqual({
      staff: 'https://app.cidclean.com/terms/staff',
      portal: 'https://app.cidclean.com/terms/client-portal',
      privacy: 'https://app.cidclean.com/privacy',
      deleteAccount: 'https://app.cidclean.com/delete-account',
    });
  });

  test('"Solicitud enviada el {fecha}"', () => {
    expect(getLegalStrings('es').requestSent('30 oct 2026')).toBe('Solicitud enviada el 30 oct 2026');
  });

  test('staff aceptado pero privacidad importante pendiente: se pide aceptar (clave conjunta)', () => {
    const key = 'a+b';
    expect(termsGate({ isSuperAdmin: false, lookup: { kind: 'ok', latestStaffDocumentId: key, acceptedDocumentIds: [] }, knownAcceptedDocumentId: null })).toBe('accept');
    expect(termsGate({ isSuperAdmin: false, lookup: { kind: 'ok', latestStaffDocumentId: key, acceptedDocumentIds: [key] }, knownAcceptedDocumentId: null })).toBe('enter');
  });
});
