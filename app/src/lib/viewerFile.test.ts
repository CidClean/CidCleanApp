jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: 'file:///cache/' } }));

import { cacheFileName, extensionFromUrl, kindFromUrl } from './viewerFile';

describe('archivo del visor (D-196)', () => {
  test('la extensión sale de la ruta de la URL firmada, no de su token', () => {
    expect(extensionFromUrl('https://x.supabase.co/storage/v1/object/sign/employee-docs/p1/w9/abc.pdf?token=a.b.c')).toBe('pdf');
    expect(extensionFromUrl('https://x/object/sign/employee-docs/p1/w9/abc.JPG?token=t.pdf')).toBe('jpg');
    expect(extensionFromUrl('https://x/object/sign/terms/staff/abc')).toBe('');
  });
  test('las fotos se muestran como imagen; PDF y lo desconocido, como PDF', () => {
    for (const e of ['jpg', 'jpeg', 'png', 'heic', 'webp']) expect(kindFromUrl(`https://x/a/b.${e}?token=t`)).toBe('image');
    expect(kindFromUrl('https://x/a/b.pdf?token=t')).toBe('pdf');
    expect(kindFromUrl('https://x/a/b?token=t')).toBe('pdf');
  });
  test('el nombre en la caché es único y con extensión segura', () => {
    expect(cacheFileName('pdf', 1000, 0.123456789)).toMatch(/^[a-z0-9]+\.pdf$/);
    expect(cacheFileName('../x', 1000, 0.5)).toMatch(/\.pdf$/);
    expect(cacheFileName('pdf', 1, 0.2)).not.toBe(cacheFileName('pdf', 2, 0.2));
  });
});
