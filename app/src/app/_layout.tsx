import { Manrope_400Regular, Manrope_500Medium, useFonts } from '@expo-google-fonts/manrope';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/lib/session';
import { clearViewerCache } from '@/lib/viewerFile';
import { brand, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { status, termsPending, termsOffline } = useSession();
  const { scheme, colors } = useTheme();

  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium });
  const ready = fontsLoaded && status !== 'loading';

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
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={status === 'out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* D-168: con la aceptación pendiente no hay otra ruta que la pantalla de términos.
            D-179: sin conexión para revisarlos, la misma ruta muestra "Necesitas conexión para continuar". */}
        <Stack.Protected guard={status === 'in' && (termsPending || termsOffline)}>
          <Stack.Screen name="(terms)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'in' && !termsPending && !termsOffline}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* D-196: el visor de PDF se abre desde los términos (antes de entrar) y desde el perfil del empleado. */}
        <Stack.Protected guard={status === 'in'}>
          <Stack.Screen name="viewer" />
        </Stack.Protected>
      </Stack>
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
