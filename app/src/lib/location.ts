import { requireOptionalNativeModule } from 'expo';

/**
 * Ubicación al marcar entrada y salida (D-214), solo en ese momento (términos del staff: GPS solo en clock in y out).
 * El APK 1.2.0 no trae el módulo nativo de expo-location: ahí se devuelve null y la entrada queda "Sin ubicación" para
 * revisión, como sin permiso o sin señal. Con el APK 1.3.0 se pide el permiso y la posición actual.
 */
export type Position = { latitude: number; longitude: number; accuracy: number | null };

export function locationAvailable(): boolean {
  return requireOptionalNativeModule('ExpoLocation') !== null;
}

export async function currentPosition(timeoutMs = 12_000): Promise<Position | null> {
  if (!locationAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location') as typeof import('expo-location');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!fix) return null;
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? null };
  } catch {
    return null;
  }
}
