import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { monthKeyOf, monthStart, monthTitle, shiftMonth } from '@/lib/accountingRules';
import { rowDate } from '@/lib/myHours';
import { useGoBack } from '@/lib/navigation';
import { completeServiceDay, fetchMyServiceDays, statusTone, type MyServiceDays } from '@/lib/serviceDays';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Mis días de servicio del 1099 (D-279, D-286 (2), `surveys/dias-servicio-aprobado.html`): mes con flechas (D-274,
 * nunca pastillas), una fila por día con la cuenta y la ficha (gris Pendiente, ámbar Requiere corrección, verde
 * Aprobado) y, si el admin lo devolvió, su nota en un aviso ámbar con "Marcar de nuevo como completado". Sin horas,
 * sin dinero y sin ubicación.
 */
export default function MyServiceDaysScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const t = useServiceDaysStrings();
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [data, setData] = useState<MyServiceDays | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setFailed(false);
    const r = await fetchMyServiceDays(monthStart(month));
    setFailed(!r.ok);
    if (r.ok) setData(r.data);
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function markAgain(visitId: string) {
    if (busy) return;
    setBusy(true);
    const r = await completeServiceDay(visitId);
    setBusy(false);
    setError(r.ok ? null : r.reason === 'network' ? t.offlineMark : t.errorMark);
    if (r.ok) await load();
  }

  const label = (s: MyServiceDays['rows'][number]['status']) => (s === 'approved' ? t.approved : s === 'needs_correction' ? t.needsCorrection : t.pending);
  const corrections = data?.rows.filter((r) => r.status === 'needs_correction' && r.note) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={t.title} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.bar, { backgroundColor: colors.card }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={strings.myHours.previousMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.arrow}>
            <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
          <AppText weight="heavy" size={15} center style={{ flex: 1 }} accessibilityRole="header">
            {monthTitle(month, a)}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={strings.myHours.nextMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.arrow}>
            <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
        </View>

        {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {error ? <AppAlert tone="error" text={error} /> : null}
        {data === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}

        {data ? (
          data.rows.length === 0 ? (
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.empty}
            </AppText>
          ) : (
            <CardBlock>
              {data.rows.map((r, i) => (
                <View key={r.id} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === data.rows.length - 1 ? 0 : 0.5 }]}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" size={14}>
                      {rowDate(r.date, strings)}
                    </AppText>
                    <AppText size={12} color={colors.secondary}>
                      {r.account}
                    </AppText>
                  </View>
                  <Chip label={label(r.status)} tone={statusTone(r.status)} />
                </View>
              ))}
            </CardBlock>
          )
        ) : null}

        {corrections.map((r) => (
          <View key={r.id} style={[styles.amber, { backgroundColor: colors.attention }]}>
            <AppText size={13} color={colors.attentionText}>
              <AppText size={13} weight="bold" color={colors.attentionText}>
                {t.noteFrom(rowDate(r.date, strings))}
              </AppText>{' '}
              {r.note}
            </AppText>
            <AppButton label={t.markAgain} onPress={() => void markAgain(r.visitId)} disabled={busy} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  bar: { height: 48, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 11 },
  amber: { borderRadius: 14, padding: 12, gap: 10 },
});
