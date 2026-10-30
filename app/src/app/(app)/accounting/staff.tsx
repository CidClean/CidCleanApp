import { Redirect, useFocusEffect } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { Card, CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchStaffCost, type StaffCost } from '@/lib/accountingApi';
import { accountingAccess, groupStaff, hoursText, isRange, money, monthTitle, periodTitle } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Personal (D-067, D-215): lo que se debe a cada empleado del trabajo aprobado, con control Por empleado / Por
 * jobsite; filas con nombre, horas y monto, y al tocarlas el detalle (por jobsite o por empleado). Sin tarifas.
 */
export default function StaffCostScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const sd = useServiceDaysStrings();
  // D-275: los 1099 cuentan días de servicio, no horas.
  const work = (minutes: number, days: number) =>
    days > 0 && minutes === 0 ? sd.days(days) : days > 0 ? `${a.hours(hoursText(minutes))} · ${sd.days(days)}` : a.hours(hoursText(minutes));
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const { period, setPeriod, jobsiteId } = usePeriod();
  const [rows, setRows] = useState<StaffCost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [by, setBy] = useState<'employee' | 'jobsite'>('employee');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchStaffCost(period, jobsiteId);
    setFailed(!r.ok);
    if (r.ok) setRows(r.data);
  }, [period, jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!acc.staff) return <Redirect href="/" />;

  const groups = groupStaff(rows ?? [], by, (m) => (isRange(period) ? monthTitle(m.slice(0, 7), a) : null));
  const total = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={a.staffTitle(periodTitle(period, a))} />
      <ScrollView contentContainerStyle={styles.page}>
        <PeriodBar period={period} onChange={setPeriod} />
        <Segmented
          options={[
            { value: 'employee', label: a.byEmployee },
            { value: 'jobsite', label: a.byJobsite },
          ]}
          value={by}
          onChange={(v) => {
            setBy(v);
            setOpen(null);
          }}
        />
        {failed ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {rows === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        <Card wide style={{ marginBottom: 12, gap: 2 }}>
          <AppText size={13} color={colors.secondary}>
            {a.staff}
          </AppText>
          <AppText weight="heavy" size={20}>
            {money(total)}
          </AppText>
          <AppText size={12} color={colors.secondary}>
            {a.staffNote}
          </AppText>
        </Card>
        {rows && groups.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {a.noStaff}
          </AppText>
        ) : null}
        {groups.length > 0 ? (
          <CardBlock>
            {groups.map((g, i) => (
              <View key={g.key} style={{ borderBottomColor: colors.border, borderBottomWidth: i === groups.length - 1 ? 0 : 0.5 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open === g.key }}
                  onPress={() => setOpen((k) => (k === g.key ? null : g.key))}
                  style={styles.row}
                >
                  <View style={{ flex: 1 }}>
                    <AppText weight="medium">{g.name}</AppText>
                    <AppText size={sample.noteSize} color={colors.secondary}>
                      {work(g.minutes, g.days)}
                    </AppText>
                  </View>
                  <AppText weight="bold">{money(g.amount)}</AppText>
                  <Icon name={open === g.key ? 'chevron-down' : 'chevron-right'} size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
                {open === g.key
                  ? g.detail.map((d) => (
                      <View key={d.key} style={styles.detail}>
                        <AppText size={13} style={{ flex: 1 }}>
                          {d.name}
                        </AppText>
                        <AppText size={13} color={colors.secondary}>
                          {work(d.minutes, d.days)}
                        </AppText>
                        <AppText size={13} weight="medium" style={{ minWidth: 86, textAlign: 'right' }}>
                          {money(d.amount)}
                        </AppText>
                      </View>
                    ))
                  : null}
              </View>
            ))}
          </CardBlock>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  row: { minHeight: 48, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 12 },
});
