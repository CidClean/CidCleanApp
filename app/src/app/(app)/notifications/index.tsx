import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useNotificationsStrings } from '@/i18n/useNotificationsStrings';
import { useStrings } from '@/i18n/useStrings';
import { historyTime } from '@/lib/history';
import { useGoBack } from '@/lib/navigation';
import { fetchNotifications, markRead, type AppNotification } from '@/lib/notificationsApi';
import { useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Bandeja de notificaciones (D-084, D-117, D-118, ronda 10): filas con título, detalle y hora a la derecha; las no
 * leídas con el punto de 8px de marca y el título en negrita; al tocar una fila pasa a leída y abre su pantalla.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const t = useNotificationsStrings();
  const { locale } = useSession();
  const [rows, setRows] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchNotifications();
    setFailed(!r.ok);
    if (r.ok) setRows(r.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function open(n: AppNotification) {
    if (!n.read) {
      setRows((rs) => (rs ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markRead(n.id);
    }
    if (n.link) router.push({ pathname: n.link.pathname as never, params: n.link.params ?? {} });
  }

  const anyUnread = (rows ?? []).some((r) => !r.read);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={goBack}
        backLabel={strings.common.back}
        title={t.title}
        action={
          anyUnread
            ? {
                label: t.markAll,
                onPress: () => {
                  setRows((rs) => (rs ?? []).map((x) => ({ ...x, read: true })));
                  void markRead(null);
                },
              }
            : undefined
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {rows && rows.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {t.empty}
          </AppText>
        ) : null}
        {rows && rows.length > 0 ? (
          <CardBlock>
            {rows.map((n, i) => (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={[n.read ? null : t.unreadLabel, n.title, n.detail].filter(Boolean).join(', ')}
                onPress={() => void open(n)}
                style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}
              >
                <View style={[styles.dot, { backgroundColor: n.read ? 'transparent' : brand }]} />
                <View style={{ flex: 1 }}>
                  <AppText weight={n.read ? 'regular' : 'bold'}>{n.title}</AppText>
                  {n.detail ? (
                    <AppText size={sample.noteSize} color={colors.secondary}>
                      {n.detail}
                    </AppText>
                  ) : null}
                </View>
                <AppText size={12} color={colors.secondary}>
                  {historyTime(strings, locale, n.createdAt)}
                </AppText>
                {n.link ? <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} /> : null}
              </Pressable>
            ))}
          </CardBlock>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
