import { Redirect, useLocalSearchParams } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import type { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { fetchDocumentUrl, logDocumentDownload } from '@/lib/documents';
import { fetchJobsiteDocumentUrl } from '@/lib/clientsApi';
import { fetchWalkthroughPdfUrl } from '@/lib/walkthroughApi';
import { useGoBack } from '@/lib/navigation';
import { fetchQuoteFileUrl } from '@/lib/quotesApi';
import { useSession } from '@/lib/session';
import { fetchTermsUrl, type TermsKind } from '@/lib/termsApi';
import { downloadToCache, kindFromUrl, loadPdfView, removeCachedFile, type ViewerKind } from '@/lib/viewerFile';
import { sample, useTheme } from '@/theme';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; kind: ViewerKind; uri: string };

/**
 * Visor de PDF dentro de la app (D-196): los términos del staff (D-176) y los documentos de los 1099 (D-175).
 * Barra con flecha de volver (D-180) y el nombre del documento; sin compartir ni descargar, salvo el W-9 para el Super Admin (D-260) y para su dueño (D-263).
 * El archivo vive solo en la caché privada de la app y se borra al salir. La URL firmada de 60 s sale de
 * open-document (documentos; deja la apertura en el historial) o de Storage firmado (términos).
 */
export default function ViewerScreen() {
  const { source, documentId, title, path, version, language, download, note, kind: termsKindParam } = useLocalSearchParams<{
    /** source 'terms': staff (por defecto), portal o privacy (D-282). */
    kind?: string;
    /** D-271: 'own-w9' en el W-9 que abre su dueño muestra "Solo lo ven tú y el Super Admin de Cid Clean." */
    note?: string;
    /** D-260: '1' en el W-9 (solo lo abre el Super Admin) muestra "Descargar". */
    download?: string;
    source: 'terms' | 'document' | 'quote-file' | 'walkthrough' | 'jobsite';
    documentId?: string;
    title?: string;
    /** source 'quote-file': ruta en el bucket quote-files (SOW o PDF del quote, hito 4). */
    path?: string;
    version?: string;
    language?: 'es' | 'en';
  }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const [state, setState] = useState<State>({ status: 'loading' });
  const { termsPending, termsOffline } = useSession();
  const termsKind: TermsKind = termsKindParam === 'privacy' ? 'privacy' : termsKindParam === 'portal' ? 'portal' : 'staff';
  // D-282: con términos o privacidad por aceptar, el visor solo abre los textos legales (sin hueco por URL directa).
  const blocked = (termsPending || termsOffline) && source !== 'terms';

  useEffect(() => {
    let cancelled = false;
    let file: File | null = null;

    async function load() {
      if (blocked) return;
      // Hito 5: los documentos del jobsite usan el mismo visor (open-jobsite-document registra cada apertura).
      // Hito 3 (D-212): el PDF del walkthrough usa el mismo visor; documentId es el walkthrough y version su versión.
      const result =
        source === 'terms'
          ? await fetchTermsUrl(termsKind)
          : source === 'quote-file'
            ? await fetchQuoteFileUrl(path ?? '')
            : source === 'walkthrough'
              ? await fetchWalkthroughPdfUrl(documentId ?? '', Number(version), language === 'en' ? 'en' : 'es')
              : source === 'jobsite'
                ? await fetchJobsiteDocumentUrl(documentId ?? '')
                : await fetchDocumentUrl(documentId ?? '');
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: 'error' });
        return;
      }
      const url = result.data.url;
      const kind = kindFromUrl(url);
      if (Platform.OS === 'web') {
        setState({ status: 'ready', kind, uri: url });
        return;
      }
      if (kind === 'pdf' && loadPdfView() === null) {
        // Expo Go: sin el módulo nativo se abre el navegador del sistema (el PDF puede quedar en Descargas).
        await WebBrowser.openBrowserAsync(url);
        if (!cancelled) goBack();
        return;
      }
      file = await downloadToCache(url);
      if (cancelled) {
        removeCachedFile(file);
        return;
      }
      setState({ status: 'ready', kind, uri: file.uri });
    }

    load().catch(() => {
      if (!cancelled) setState({ status: 'error' });
    });
    return () => {
      cancelled = true;
      removeCachedFile(file);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, documentId, path, version, termsKind, blocked]);

  const PdfView = state.status === 'ready' && state.kind === 'pdf' ? loadPdfView() : null;

  if (blocked) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={title ?? ''}
        onBack={goBack}
        backLabel={strings.common.back}
        action={
          download === '1' && state.status === 'ready'
            ? {
                label: strings.employee.download,
                icon: 'download',
                accessibilityLabel: strings.employee.download,
                onPress: () => {
                  const uri = state.uri;
                  // D-280: cada descarga del W-9 queda en el historial. En la web el enlace del W-9 cifrado es de un
                  // solo uso: se pide uno nuevo (que registra la descarga) y se abre en una pestaña.
                  if (Platform.OS === 'web') {
                    if (source === 'document' && documentId) {
                      void fetchDocumentUrl(documentId, 'download').then((r) => {
                        if (r.ok) window.open(r.data.url, '_blank', 'noopener');
                      });
                      return;
                    }
                    window.open(uri, '_blank', 'noopener');
                    return;
                  }
                  if (source === 'document' && documentId) void logDocumentDownload(documentId);
                  // Módulo nativo cargado al usarlo, como en sharePdf.ts.
                  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
                  void Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title ?? '' }).catch(() => {});
                },
              }
            : undefined
        }
      />
      {state.status === 'loading' ? (
        <BrandLoading label={strings.common.loading} />
      ) : null}
      {state.status === 'error' ? (
        <View style={{ padding: 12 }}>
          <AppAlert tone="error" text={source === 'terms' ? strings.terms.errorLoad : strings.employee.errorOpen} />
        </View>
      ) : null}
      {state.status === 'ready' && Platform.OS === 'web' ? (
        <iframe title={title ?? ''} src={state.uri} style={{ flex: 1, border: 0, width: '100%' }} />
      ) : null}
      {state.status === 'ready' && Platform.OS !== 'web' && state.kind === 'image' ? (
        <Image accessibilityLabel={title} source={{ uri: state.uri }} resizeMode="contain" style={styles.fill} />
      ) : null}
      {PdfView && state.status === 'ready' && Platform.OS !== 'web' ? (
        <PdfView uri={state.uri} fitMode="width" style={[styles.fill, { backgroundColor: colors.surface }]} />
      ) : null}
      {note === 'own-w9' && state.status === 'ready' ? (
        <View style={{ padding: 12 }}>
          <AppText size={sample.noteSize} color={colors.secondary}>
            {strings.profile.ownW9Note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
});
