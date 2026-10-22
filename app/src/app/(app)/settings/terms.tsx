import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { formatDate } from '@/lib/employeeRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { choosePdf, fetchCurrentTerms, publishTerms, type CurrentTerms, type PickedPdf, type TermsKind } from '@/lib/termsApi';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Términos del staff (D-176, D-187): el Super Admin sube el PDF del abogado y publica una versión nueva.
 * Línea de versión vigente, recuadro punteado "Subir PDF", nombre del archivo, aviso ámbar y botón sólido.
 */
export default function PublishTermsScreen() {
  // ?kind=portal: términos del portal del cliente (D-209), con la misma pantalla.
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: TermsKind = kindParam === 'portal' ? 'portal' : 'staff';
  const qs = useQuoteStrings();
  const goBack = useGoBack();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const { locale } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [current, setCurrent] = useState<CurrentTerms | null>(null);
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentTerms(kind).then((result) => {
      if (!cancelled && result.ok) setCurrent(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function pick() {
    setError(false);
    try {
      const picked = await choosePdf();
      if (picked.kind === 'picked') setFile(picked.file);
    } catch {
      setError(true);
    }
  }

  async function publish() {
    if (!file || publishing) return;
    setPublishing(true);
    setError(false);
    const result = await publishTerms(file, kind);
    if (!result.ok) {
      setPublishing(false);
      setError(true);
      return;
    }
    const refreshed = await fetchCurrentTerms(kind);
    if (refreshed.ok) setCurrent(refreshed.data);
    setFile(null);
    setPublishing(false);
  }

  const versionLine =
    current === null ? strings.settings.unpublished : strings.settings.currentVersion(current.version, formatDate(current.publishedAt, locale));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={kind === 'portal' ? qs.portalTermsRow : strings.settings.termsRow} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
          {versionLine}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.settings.uploadPdf}
          onPress={() => void pick()}
          style={[styles.drop, { borderColor: colors.switchOff }]}
        >
          <Icon name="file-text" size={26} strokeWidth={iconStrokeWidth} color={brand} />
          <AppText weight="medium" size={sample.buttonSize} color={brand}>
            {strings.settings.uploadPdf}
          </AppText>
        </Pressable>
        {file ? (
          <View style={[styles.fileRow, { borderBottomColor: colors.border }]}>
            <AppText size={sample.noteSize} color={colors.secondary} numberOfLines={1}>
              {file.name}
            </AppText>
          </View>
        ) : null}
        <AppAlert text={(kind === 'portal' ? qs.portalTermsNote : strings.settings.acceptAgain)} />
        {error ? <AppAlert tone="error" text={strings.settings.errorPublish} /> : null}
        <AppButton label={strings.settings.publish} onPress={() => void publish()} disabled={!file || publishing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drop: {
    minHeight: 112, // la muestra mide 112px a la vista: 110 de relleno más el borde de 1px por lado
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  // Fila del nombre del archivo (muestra ronda 15): 40px con línea fina debajo.
  fileRow: { minHeight: 40, justifyContent: 'center', borderBottomWidth: 0.5 },
});
