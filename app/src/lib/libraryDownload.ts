import { Platform } from 'react-native';

import { fetchJobsiteDocumentUrl } from './clientsApi';
import { fetchDocumentUrl } from './documents';
import type { LibraryDoc } from './documentsLibrary';
import { fetchIcaSignedUrl } from './icaApi';
import { fetchQuoteFileUrl } from './quotesApi';
import { downloadOnWeb, downloadToCache, viewerFileName } from './viewerFile';
import { fetchWalkthroughPdfUrl } from './walkthroughApi';

/** URL firmada para descargar, con las mismas funciones que usa el visor (permisos, historial). */
export async function libraryUrlFor(d: LibraryDoc, language: 'es' | 'en') {
  if (d.source === 'quote-file') return fetchQuoteFileUrl(d.path ?? '');
  if (d.source === 'walkthrough') return fetchWalkthroughPdfUrl(d.openId ?? '', d.version ?? 1, language);
  if (d.source === 'document') return fetchDocumentUrl(d.openId ?? '', 'download');
  if (d.source === 'ica-signed') return fetchIcaSignedUrl(d.openId ?? '');
  return fetchJobsiteDocumentUrl(d.openId ?? '');
}

/**
 * Descarga un documento de la biblioteca con su nombre legible (D-296): en la web lo guarda; en el teléfono abre la hoja
 * de compartir. Devuelve false si no se pudo. Lo usan Documentos (orden 115) y Documents del jobsite (orden 150).
 */
export async function downloadLibraryDoc(d: LibraryDoc, title: string, language: 'es' | 'en'): Promise<boolean> {
  const r = await libraryUrlFor(d, language);
  if (!r.ok) return false;
  const given = r.data as { fileName?: string; file_name?: string };
  const name = viewerFileName(r.data.url, `${title} - ${d.owner}`, given.fileName ?? given.file_name);
  try {
    if (Platform.OS === 'web') {
      await downloadOnWeb(r.data.url, name);
      return true;
    }
    const file = await downloadToCache(r.data.url, name);
    // Módulo nativo cargado al usarlo, como en el visor.
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    await Sharing.shareAsync(file.uri, { dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}
