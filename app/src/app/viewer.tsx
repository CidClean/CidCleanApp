import { useLocalSearchParams } from 'expo-router';
import type { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { fetchDocumentUrl } from '@/lib/documents';
import { useGoBack } from '@/lib/navigation';
import { fetchQuoteFileUrl } from '@/lib/quotesApi';
import { fetchTermsUrl } from '@/lib/termsApi';
import { downloadToCache, kindFromUrl, loadPdfView, removeCachedFile, type ViewerKind } from '@/lib/viewerFile';
import { useTheme } from '@/theme';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; kind: ViewerKind; uri: string };

/**
 * Visor de PDF dentro de la app (D-196): los términos del staff (D-176) y los documentos de los 1099 (D-175).
 * Barra con flecha de volver (D-180) y el nombre del documento; sin botones de compartir ni descargar.
 * El archivo vive solo en la caché privada de la app y se borra al salir. La URL firmada de 60 s sale de
 * open-document (documentos; deja la apertura en el historial) o de Storage firmado (términos).
 */
export default function ViewerScreen() {
  const { source, documentId, title, path } = useLocalSearchParams<{
    source: 'terms' | 'document' | 'quote-file';
    documentId?: string;
    title?: string;
    /** source 'quote-file': ruta en el bucket quote-files (SOW o PDF del quote, hito 4). */
    path?: string;
  }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let file: File | null = null;

    async function load() {
      const result =
        source === 'terms'
          ? await fetchTermsUrl()
          : source === 'quote-file'
            ? await fetchQuoteFileUrl(path ?? '')
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
  }, [source, documentId, path]);

  const PdfView = state.status === 'ready' && state.kind === 'pdf' ? loadPdfView() : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={title ?? ''} onBack={goBack} backLabel={strings.common.back} />
      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.secondary} />
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
});
