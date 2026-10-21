import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_KEY. Copia .env.example a .env.local y complétalos.',
  );
}

/** Clave de AsyncStorage donde Supabase guarda la sesión (se usa también para forzar el cierre local). */
export const AUTH_STORAGE_KEY = 'cidclean-auth';

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// En el teléfono, el refresco automático solo corre con la app en primer plano (guía de Supabase para Expo).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
