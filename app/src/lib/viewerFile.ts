import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

import { readableFileName } from './fileName';

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

/**
 * Nombre con que se guarda el archivo del visor (D-296): el que dio el servidor o la pantalla, o "Cid Clean - {título}",
 * siempre con la extensión real del archivo.
 */
export function viewerFileName(url: string, title: string | null | undefined, given?: string | null): string {
  const ext = extensionFromUrl(url) || 'pdf';
  const base = given ? given.replace(/\.[a-z0-9]{1,5}$/i, '') : null;
  return readableFileName([base ?? title ?? null], ext);
}

/**
 * Descarga la URL firmada a la caché privada con el nombre legible (D-296), dentro de una carpeta propia para que dos
 * archivos con el mismo nombre no choquen. Quien llama debe borrar el archivo con `removeCachedFile`.
 */
export async function downloadToCache(url: string, fileName: string): Promise<File> {
  const directory = new Directory(viewerDirectory(), cacheFileName('d').replace(/\.d$/, ''));
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, fileName);
  return File.downloadFileAsync(url, destination);
}

/**
 * Web (D-296): baja el archivo y lo guarda con el nombre legible (atributo download de un enlace a un blob local; el
 * atributo no sirve con URLs de otro dominio). Si no se puede leer, se abre la URL en una pestaña.
 */
export async function downloadOnWeb(url: string, fileName: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('download');
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function removeCachedFile(file: File | null): void {
  try {
    const parent = file?.parentDirectory;
    file?.delete();
    if (parent && parent.uri !== viewerDirectory().uri) parent.delete();
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
