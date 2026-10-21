import { en } from './en';
import { es } from './es';
import { getStrings, localeFromDevice, selectLocale } from './index';

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('idioma del teléfono (D-159b)', () => {
  test('español si empieza por "es"; inglés en los demás casos', () => {
    expect(localeFromDevice('es')).toBe('es');
    expect(localeFromDevice('es-MX')).toBe('es');
    expect(localeFromDevice('ES')).toBe('es');
    expect(localeFromDevice('en')).toBe('en');
    expect(localeFromDevice('fr')).toBe('en');
    expect(localeFromDevice('pt')).toBe('en');
    expect(localeFromDevice(null)).toBe('en');
    expect(localeFromDevice(undefined)).toBe('en');
    expect(localeFromDevice('')).toBe('en');
  });
});

describe('selectLocale', () => {
  const base = { profileLanguage: null, rememberedLanguage: null } as const;

  test('sin sesión manda el teléfono, aunque haya un idioma recordado', () => {
    expect(selectLocale({ ...base, signedIn: false, deviceLanguageCode: 'es-US' })).toBe('es');
    expect(selectLocale({ ...base, signedIn: false, deviceLanguageCode: 'en-US' })).toBe('en');
    expect(
      selectLocale({ signedIn: false, profileLanguage: 'es', rememberedLanguage: 'es', deviceLanguageCode: 'en-US' }),
    ).toBe('en');
  });

  test('con sesión manda el idioma del perfil', () => {
    expect(
      selectLocale({ signedIn: true, profileLanguage: 'en', rememberedLanguage: 'es', deviceLanguageCode: 'es-MX' }),
    ).toBe('en');
    expect(
      selectLocale({ signedIn: true, profileLanguage: 'es', rememberedLanguage: null, deviceLanguageCode: 'en-US' }),
    ).toBe('es');
  });

  test('con sesión y sin perfil leído: el último recordado, y si no hay, el del teléfono', () => {
    expect(
      selectLocale({ signedIn: true, profileLanguage: null, rememberedLanguage: 'es', deviceLanguageCode: 'en-US' }),
    ).toBe('es');
    expect(selectLocale({ ...base, signedIn: true, deviceLanguageCode: 'es-MX' })).toBe('es');
    expect(selectLocale({ ...base, signedIn: true, deviceLanguageCode: 'fr' })).toBe('en');
  });
});

describe('textos', () => {
  test('en.ts tiene exactamente las mismas claves que es.ts y ninguna vacía', () => {
    expect(keys(en)).toEqual(keys(es));
    for (const k of keys(en)) {
      const value = k.split('.').reduce<any>((o, p) => o[p], en);
      expect(typeof value === 'string' && value.length > 0).toBe(true);
    }
  });

  test('getStrings devuelve cada idioma', () => {
    expect(getStrings('es').email.send).toBe('Enviar código');
    expect(getStrings('en').email.send).toBe('Send code');
  });
});
