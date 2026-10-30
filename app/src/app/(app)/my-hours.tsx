import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { Card, CardBlock, useCardText } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { monthKeyOf, monthStart, monthTitle, shiftMonth } from '@/lib/accountingRules';
import { hoursLabel, rowDate, type MyHours } from '@/lib/myHours';
import { useGoBack } from '@/lib/navigation';
import { fetchMyHours } from '@/lib/scheduleApi';
import { useSession } from '@/lib/session';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Mis horas (D-272, D-274, `surveys/mis-horas-aprobado.html`): selector de mes con flechas (como D-069, sin
 * pastillas ni "Rango"), tarjeta verde con Trabajadas y Aseguradas del mes, una fila por día con la cuenta y
 * "de {n} h aseguradas", y la nota. Para todos los empleados (W2 y 1099); solo horas del trabajo aprobado, nunca
 * dinero ni el tope de 32 h (D-223). Solo W-2 (D-279).
 */
export default function MyHoursScreen() {
  // D-279: Mis horas solo para W-2; el 1099 va a Mis días de servicio.
  const contractor = useSession().profile?.workerType === '1099';
  return contractor ? <Redirect href="/my-service-days" /> : <MyHours />;
}

function MyHours() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const h = strings.myHours;
  const hero = useCardText('brand');
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [data, setData] = useState<MyHours | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setFailed(false);
    const r = await fetchMyHours(monthStart(month));
    setFailed(!r.ok);
    if (r.ok) setData(r.data);
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={h.title} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.bar, { backgroundColor: colors.card }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={h.previousMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.arrow}>
            <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
          <AppText weight="heavy" size={15} center style={{ flex: 1 }} accessibilityRole="header">
            {monthTitle(month, a)}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={h.nextMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.arrow}>
            <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
        </View>

        {failed ? <AppAlert tone="error" text={h.errorLoad} /> : null}
        {data === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}

        {data ? (
          <>
            <Card tone="brand" wide style={styles.hero}>
              <View style={{ flex: 1 }}>
                <AppText size={12} color={hero.soft} style={{ opacity: hero.softOpacity }}>
                  {h.worked}
                </AppText>
                <AppText weight="heavy" size={26} color={hero.main}>
                  {hoursLabel(data.workedMinutes)}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText size={12} color={hero.soft} style={{ opacity: hero.softOpacity }}>
                  {h.insured}
                </AppText>
                <AppText weight="heavy" size={26} color={hero.main}>
                  {hoursLabel(data.insuredMinutes)}
                </AppText>
              </View>
            </Card>

            {data.rows.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {h.empty}
              </AppText>
            ) : (
              <CardBlock>
                {data.rows.map((r, i) => (
                  <View
                    key={`${r.date}-${i}`}
                    style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === data.rows.length - 1 ? 0 : 0.5 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" size={14}>
                        {rowDate(r.date, strings)}
                      </AppText>
                      <AppText size={12} color={colors.secondary}>
                        {r.account}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText weight="bold" size={14}>
                        {hoursLabel(r.workedMinutes)}
                      </AppText>
                      <AppText size={13}>{h.ofInsured(hoursLabel(r.insuredMinutes))}</AppText>
                    </View>
                  </View>
                ))}
              </CardBlock>
            )}

            <AppText size={12} color={colors.secondary} style={{ lineHeight: 17 }}>
              {h.note}
            </AppText>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  bar: { height: 48, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 8, padding: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 11 },
});
