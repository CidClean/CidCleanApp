import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { TopBar } from '@/components/TopBar';
import { getDocumentsLibraryStrings } from '@/i18n/documentsLibrary';
import { useStrings } from '@/i18n/useStrings';
import { LIBRARY_FILTERS, PAGE_SIZE, canSeeDocuments, fetchLibrary, rowTitle, viewerParams, type LibraryDoc, type LibraryFilter } from '@/lib/documentsLibrary';
import { downloadLibraryDoc } from '@/lib/libraryDownload';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

function shortDate(iso: string | null, locale: 'es' | 'en'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(iso));
}

/**
 * Menú → Documentos (orden 115, D-317 4, D-320 muestra 4): buscador, filtros, una fila por documento (nombre, cliente o
 * persona, fecha); tocar la fila lo abre y "Descargar" lo guarda con su nombre legible (D-296). Cada persona ve solo lo
 * que ya puede ver (documents_library).
 */
export default function DocumentsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { locale } = useSession();
  const lang = locale === 'en' ? 'en' : 'es';
  const t = getDocumentsLibraryStrings(lang);
  const { access } = usePermissions();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openError, setOpenError] = useState(false);

  const load = useCallback(
    async (offset = 0) => {
      const r = await fetchLibrary(filter, search, offset);
      if (!r.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setDocs((prev) => (offset === 0 ? r.data : [...prev, ...r.data]));
      setMore(r.data.length === PAGE_SIZE);
    },
    [filter, search],
  );

  useFocusEffect(
    useCallback(() => {
      void load(0);
    }, [load]),
  );

  if (!canSeeDocuments(access)) return <Redirect href="/" />;

  function open(d: LibraryDoc) {
    router.push({ pathname: '/viewer', params: viewerParams(d, rowTitle(d, t), lang) });
  }

  async function download(d: LibraryDoc) {
    setOpenError(false);
    if (!(await downloadLibraryDoc(d, rowTitle(d, t), lang))) setOpenError(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
        <AppField label={t.search} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} maxLength={100} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {LIBRARY_FILTERS.map((f) => (
            <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)}>
              <Chip label={t.filters[f]} tone={filter === f ? 'brand' : 'neutral'} medium />
            </Pressable>
          ))}
        </ScrollView>
        {failed ? <AppAlert tone="error" text={t.error} /> : null}
        {openError ? <AppAlert tone="error" text={t.errorOpen} /> : null}
        {!failed && docs.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {filter === 'reports' ? t.emptyReports : t.empty}
          </AppText>
        ) : null}
        {docs.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {docs.map((d, i) => (
              <View key={`${d.kind}:${d.id}`} style={[styles.row, i < docs.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null]}>
                <Pressable accessibilityRole="button" accessibilityLabel={rowTitle(d, t)} onPress={() => open(d)} style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {rowTitle(d, t)}
                  </AppText>
                  <AppText size={12} color={colors.secondary} numberOfLines={1}>
                    {[d.owner, shortDate(d.date, lang)].filter(Boolean).join(' · ')}
                  </AppText>
                  {d.superAdminOnly ? <Chip label={t.superAdminOnly} tone="warning" /> : null}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t.download} ${rowTitle(d, t)}`} onPress={() => void download(d)} hitSlop={8}>
                  <AppText weight="bold" color={colors.brandText}>
                    {t.download}
                  </AppText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {more ? <AppButton label={t.more} variant="outline" onPress={() => void load(docs.length)} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
