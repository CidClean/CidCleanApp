import { es, type Strings } from './es';

export type Locale = 'es' | 'en';

/**
 * Hoy solo existe español. Cuando el dueño apruebe los textos en inglés (D-087)
 * se agrega `en.ts` con el tipo `Strings` y se registra aquí.
 */
const locales: Partial<Record<Locale, Strings>> = { es };

export function getStrings(locale: Locale = 'es'): Strings {
  return locales[locale] ?? es;
}

export const strings: Strings = getStrings();
