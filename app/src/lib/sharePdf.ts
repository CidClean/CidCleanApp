import { requireOptionalNativeModule } from 'expo';

/**
 * PDF y hoja de compartir del teléfono (D-231). expo-print y expo-sharing son módulos nativos nuevos: el APK 1.2.0 no
 * los trae, y ahí Compartir avisa que llega con la 1.3.0 en vez de fallar.
 */
export function shareAvailable(): boolean {
  return requireOptionalNativeModule('ExpoPrint') !== null && requireOptionalNativeModule('ExpoSharing') !== null;
}

/**
 * D-296: el PDF de expo-print sale con un nombre al azar ("a64caa6b-….pdf"); antes de compartirlo se mueve a la caché
 * privada con el nombre legible (lib/fileName).
 */
export async function sharePdf(html: string, title: string, fileName: string): Promise<'shared' | 'unavailable' | 'error'> {
  if (!shareAvailable()) return 'unavailable';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print') as typeof import('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system') as typeof import('expo-file-system');
    const { uri } = await Print.printToFileAsync({ html });
    const named = namedCacheFile(FS, fileName);
    await new FS.File(uri).move(named);
    await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    return 'shared';
  } catch {
    return 'error';
  }
}

/**
 * CSV de los exportes de Accounting (D-215) con la hoja de compartir del teléfono (orden 27). Se escribe en la caché
 * privada de la app y se comparte; el teléfono decide dónde se guarda o a quién se envía.
 */
export async function shareCsv(csv: string, fileName: string, title: string): Promise<'shared' | 'unavailable' | 'error'> {
  if (requireOptionalNativeModule('ExpoSharing') === null) return 'unavailable';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system') as typeof import('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const file = namedCacheFile(FS, fileName);
    file.create();
    // Con BOM para que la hoja de cálculo lea bien los acentos.
    file.write('﻿' + csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title });
    return 'shared';
  } catch {
    return 'error';
  }
}

/** Archivo en la caché privada (`Paths.cache/share`) con el nombre legible; si ya había uno con ese nombre, se borra. */
function namedCacheFile(FS: typeof import('expo-file-system'), fileName: string): import('expo-file-system').File {
  const directory = new FS.Directory(FS.Paths.cache, 'share');
  directory.create({ idempotent: true, intermediates: true });
  const file = new FS.File(directory, fileName);
  if (file.exists) file.delete();
  return file;
}
