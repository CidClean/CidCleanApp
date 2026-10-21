import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

/**
 * Visor de archivos dentro de la app (D-196). El archivo se descarga a la carpeta privada de caché de la app
 * (`Paths.cache/viewer`, no es Descargas ni una carpeta pública) y se borra al cerrar el visor.
 */

export type ViewerKind = 'pdf' | 'image';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];

/** Extensión del archivo de una URL firmada (la ruta del objeto termina en <nombre>.<ext>). */
export function extensionFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot + 1).toLowerCase() : '';
}

/** Un PDF o una foto (los documentos de los 1099 pueden ser fotos, D-183); lo desconocido se trata como PDF. */
export function kindFromUrl(url: string): ViewerKind {
  return IMAGE_EXTENSIONS.includes(extensionFromUrl(url)) ? 'image' : 'pdf';
}

export function cacheFileName(extension: string, now: number = Date.now(), random: number = Math.random()): string {
  const safe = /^[a-z0-9]{1,5}$/.test(extension) ? extension : 'pdf';
  return `${now.toString(36)}${random.toString(36).slice(2, 10)}.${safe}`;
}

const viewerDirectory = () => new Directory(Paths.cache, 'viewer');

/** Descarga la URL firmada a la caché privada. Quien llama debe borrar el archivo con `removeCachedFile`. */
export async function downloadToCache(url: string): Promise<File> {
  const directory = viewerDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, cacheFileName(extensionFromUrl(url)));
  return File.downloadFileAsync(url, destination);
}

export function removeCachedFile(file: File | null): void {
  try {
    file?.delete();
  } catch {
    // ya no existe
  }
}

/** Borra lo que haya quedado en la caché del visor (por ejemplo si la app se cerró con un archivo abierto). */
export function clearViewerCache(): void {
  try {
    const directory = viewerDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // nada que borrar
  }
}

type PdfViewComponent = ComponentType<ViewProps & { uri: string; fitMode?: 'width' | 'height' | 'both'; onError?: (e: unknown) => void }>;

/**
 * Visor nativo de PDF (@kishannareshpal/expo-pdf: PDFium en Android, PDFKit en iPhone). Solo existe en el APK:
 * en Expo Go y en la web el módulo nativo no está y devuelve null (respaldo: el navegador del sistema).
 */
export function loadPdfView(): PdfViewComponent | null {
  if (Platform.OS === 'web') return null;
  try {
    if (!requireOptionalNativeModule('KJExpoPdf')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@kishannareshpal/expo-pdf').PdfView as PdfViewComponent;
  } catch {
    return null;
  }
}
