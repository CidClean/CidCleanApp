import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * PDF y hoja de compartir del teléfono (D-231). En la web (app.cidclean.com, D-319 7) no hay módulos nativos: el PDF
 * se arma con la impresión del navegador ("Guardar como PDF", con el nombre legible como título) y el CSV se descarga
 * con su nombre legible (D-296).
 */
export function shareAvailable(): boolean {
  if (Platform.OS === 'web') return typeof document !== 'undefined';
  return requireOptionalNativeModule('ExpoPrint') !== null && requireOptionalNativeModule('ExpoSharing') !== null;
}

/** Nombre sin la extensión (lo que el navegador usa para "Guardar como PDF"). */
export function printTitle(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '');
}

/** Pone el título en el HTML del documento (o lo agrega) para que el PDF guardado lleve el nombre legible. */
export function withTitle(html: string, title: string): string {
  const safe = title.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string);
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safe}</title>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}<title>${safe}</title>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safe}</title></head><body>${html}</body></html>`;
}

/** Web: imprime el HTML en un marco oculto; el navegador ofrece "Guardar como PDF" con el título como nombre. */
async function printOnWeb(html: string, fileName: string): Promise<'shared' | 'error'> {
  try {
    const title = printTitle(fileName);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error('frame');
    doc.open();
    doc.write(withTitle(html, title));
    doc.close();
    const previous = document.title;
    document.title = title; // Safari usa el título de la página para el nombre del PDF
    await new Promise((resolve) => setTimeout(resolve, 250));
    win.focus();
    win.print();
    setTimeout(() => {
      document.title = previous;
      frame.remove();
    }, 1000);
    return 'shared';
  } catch {
    return 'error';
  }
}

/** Web: descarga un archivo de texto con su nombre legible (enlace a un blob local). */
export function downloadTextOnWeb(content: string, fileName: string, mimeType: string): 'shared' | 'error' {
  try {
    const href = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return 'shared';
  } catch {
    return 'error';
  }
}

/**
 * D-296: el PDF de expo-print sale con un nombre al azar ("a64caa6b-….pdf"); antes de compartirlo se mueve a la caché
 * privada con el nombre legible (lib/fileName).
 */
export async function sharePdf(html: string, title: string, fileName: string): Promise<'shared' | 'unavailable' | 'error'> {
  if (Platform.OS === 'web') return typeof document === 'undefined' ? 'unavailable' : printOnWeb(html, fileName);
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
  // Con BOM para que la hoja de cálculo lea bien los acentos.
  if (Platform.OS === 'web') return typeof document === 'undefined' ? 'unavailable' : downloadTextOnWeb('\ufeff' + csv, fileName, 'text/csv;charset=utf-8');
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
