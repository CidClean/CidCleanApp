import { Manrope_400Regular, Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { DoneOverlayHost } from '@/components/brand/DoneOverlay';
import { OpeningAnimation } from '@/components/brand/OpeningAnimation';

import { SessionProvider, useSession } from '@/lib/session';
import { clearViewerCache } from '@/lib/viewerFile';
import { brand, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Exportación web del portal del cliente (quote.cidclean.com, D-161, D-209): EXPO_PUBLIC_PORTAL_ONLY=1 deja solo
 * las rutas /q y /w9 (D-256); la app del staff no se publica ahí.
 */
const PORTAL_ONLY = process.env.EXPO_PUBLIC_PORTAL_ONLY === '1';

function Routes() {
  const { status, termsPending, termsOffline } = useSession();
  const { scheme, colors } = useTheme();

  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold });
  const ready = fontsLoaded && status !== 'loading';
  // Orden 34 (D-250): animación de apertura al abrir la app, después de la pantalla nativa de inicio. No en el portal
  // web (D-200: el cliente entra directo al quote).
  const [opening, setOpening] = useState(Platform.OS !== 'web' && !PORTAL_ONLY);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // D-196: lo que haya quedado en la caché del visor (por ejemplo si la app se cerró con un archivo abierto) se borra al abrir.
  useEffect(() => {
    clearViewerCache();
  }, []);

  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: brand,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1 }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Portal del cliente (D-209): sin sesión del staff, siempre disponible. */}
        <Stack.Screen name="q/index" />
        <Stack.Screen name="q/[token]" />
        {/* W-9 del 1099 (D-255, D-256): mismo portal y misma exportación, sin sesión del staff. */}
        <Stack.Screen name="w9/[token]" />
        <Stack.Protected guard={!PORTAL_ONLY && status === 'out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* D-168: con la aceptación pendiente no hay otra ruta que la pantalla de términos.
            D-179, D-197: sin conexión para revisarlos y sin haber aceptado antes, la misma ruta muestra "Necesitas conexión para continuar". */}
        <Stack.Protected guard={!PORTAL_ONLY && status === 'in' && (termsPending || termsOffline)}>
          <Stack.Screen name="(terms)" />
        </Stack.Protected>
        <Stack.Protected guard={!PORTAL_ONLY && status === 'in' && !termsPending && !termsOffline}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* D-196: el visor de PDF se abre desde los términos (antes de entrar) y desde el perfil del empleado. */}
        <Stack.Protected guard={!PORTAL_ONLY && status === 'in'}>
          <Stack.Screen name="viewer" />
        </Stack.Protected>
      </Stack>
      <DoneOverlayHost />
      {opening ? <OpeningAnimation onDone={() => setOpening(false)} /> : null}
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
