import { requireOptionalNativeModule } from 'expo';

/**
 * PDF y hoja de compartir del teléfono (D-231). expo-print y expo-sharing son módulos nativos nuevos: el APK 1.2.0 no
 * los trae, y ahí Compartir avisa que llega con la 1.3.0 en vez de fallar.
 */
export function shareAvailable(): boolean {
  return requireOptionalNativeModule('ExpoPrint') !== null && requireOptionalNativeModule('ExpoSharing') !== null;
}

export async function sharePdf(html: string, title: string): Promise<'shared' | 'unavailable' | 'error'> {
  if (!shareAvailable()) return 'unavailable';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print') as typeof import('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    return 'shared';
  } catch {
    return 'error';
  }
}
