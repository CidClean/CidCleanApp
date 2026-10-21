import { en } from './en';
import { es, type Strings } from './es';

export type Locale = 'es' | 'en';

const locales: Record<Locale, Strings> = { es, en };

export function getStrings(locale: Locale): Strings {
  return locales[locale];
}

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

/** D-159b: español si el teléfono está en español (código de idioma "es", "es-MX"...), inglés en los demás casos. */
export function localeFromDevice(languageCode: string | null | undefined): Locale {
  return typeof languageCode === 'string' && languageCode.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * Idioma de la app.
 * - Antes de iniciar sesión: el del teléfono (D-159b).
 * - Con sesión: `profiles.language` (D-087); si aún no se pudo leer, el último recordado; si no hay, el del teléfono.
 */
export function selectLocale(input: {
  signedIn: boolean;
  profileLanguage: Locale | null;
  rememberedLanguage: Locale | null;
  deviceLanguageCode: string | null | undefined;
}): Locale {
  const device = localeFromDevice(input.deviceLanguageCode);
  if (!input.signedIn) return device;
  return input.profileLanguage ?? input.rememberedLanguage ?? device;
}
