import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLocale, type Locale } from './index';

const KEY = 'cidclean-language';

/** Último idioma del perfil, para la siguiente apertura si no hay red. */
export async function rememberLanguage(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, locale);
  } catch {
    // sin almacenamiento: se usará el idioma del teléfono
  }
}

export async function readRememberedLanguage(): Promise<Locale | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}
