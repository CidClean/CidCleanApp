import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Tema de la app (D-222 b): Sistema (por defecto, D-028), Claro u Oscuro. Se recuerda en este teléfono y el cambio
 * se aplica al instante en todas las pantallas (cada useTheme se suscribe a esta preferencia).
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const KEY = 'cidclean-theme';
let current: ThemePreference = 'system';
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

/** Lee la preferencia guardada (una vez, al arrancar). */
export async function loadThemePreference(): Promise<ThemePreference> {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (isPreference(raw) && raw !== current) {
      current = raw;
      emit();
    }
  } catch {
    // Sin almacenamiento: queda Sistema.
  }
  return current;
}

export function getThemePreference(): ThemePreference {
  return current;
}

export async function setThemePreference(next: ThemePreference): Promise<void> {
  current = next;
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // Se aplica igual en esta sesión aunque no se pueda guardar.
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!loaded) void loadThemePreference();
  return () => {
    listeners.delete(fn);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, getThemePreference);
}

/** Para las pruebas. */
export function resetThemePreferenceForTests(value: ThemePreference = 'system') {
  current = value;
  loaded = true;
  emit();
}
