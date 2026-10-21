import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { HISTORY_PAGE, historyDetail, historyTime, historyTitle, mergePage, type HistoryEntry } from '@/lib/history';
import { fetchHistoryPage } from '@/lib/historyApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { density, sample, useTheme } from '@/theme';

/**
 * Menú → Historial de cambios (D-088, D-198, muestra ronda 17): lista cronológica, la más reciente arriba, y carga
 * la página siguiente al bajar. Con `historial_ver`; el Super Admin siempre.
 */
export default function HistoryScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { locale } = useSession();
  const { can } = usePermissions();
  const allowed = can('historial_ver');

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [done, setDone] = useState(false);
  const loading = useRef(false);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loading.current) return;
      loading.current = true;
      const before = reset ? null : entries.length > 0 ? entries[entries.length - 1].id : null;
      const result = await fetchHistoryPage(before);
      loading.current = false;
      if (!result.ok) {
        setState('error');
        return;
      }
      setEntries((prev) => mergePage(reset ? [] : prev, result.data));
      setDone(result.data.length < HISTORY_PAGE);
      setState('ready');
    },
    [entries],
  );

  useEffect(() => {
    if (allowed) void loadMore(true);
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return <Redirect href="/" />;

  const now = new Date();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.history} onBack={goBack} backLabel={strings.common.back} />
      <FlatList
        data={entries}
        testID="history-list"
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: 12 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (state === 'ready' && !done) void loadMore();
        }}
        ListHeaderComponent={state === 'error' ? <AppAlert tone="error" text={strings.history.errorLoad} /> : undefined}
        ListEmptyComponent={
          state === 'ready' ? (
            <AppText color={colors.secondary} center style={{ marginTop: 24 }}>
              {strings.history.empty}
            </AppText>
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const detail = historyDetail(strings, item);
          return (
            <View
              style={[
                styles.row,
                { borderBottomColor: colors.border, borderBottomWidth: index === entries.length - 1 ? 0 : 0.5 },
              ]}
            >
              <View style={styles.texts}>
                <AppText weight="medium">{historyTitle(strings, item)}</AppText>
                {detail ? (
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {detail}
                  </AppText>
                ) : null}
              </View>
              <AppText size={sample.noteSize} color={colors.secondary} numberOfLines={1}>
                {historyTime(strings, locale, item.at, now)}
              </AppText>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Muestra ronda 17 `.vr`: alto mínimo 48, relleno 6/0, alineado arriba, línea fina debajo.
  row: { minHeight: density.row, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  texts: { flex: 1 },
});
