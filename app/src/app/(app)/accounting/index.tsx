import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { Bento, Card, useCardText, type CardTone } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { ChartIcon, ClockIcon, DocIcon, PeopleIcon, QuoteDueIcon } from '@/components/illustrations';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchAccountingJobsites, fetchDashboard, fetchRecurring, type AccountingJobsite } from '@/lib/accountingApi';
import { accountingAccess, isRange, money, type DashboardFigures } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { canAny, ACCOUNTING_KEYS } from '@/lib/visibility';
import { iconStrokeWidth, useTheme } from '@/theme';

/**
 * Accounting (D-068, D-069, D-102, D-215, D-226 bento C1): control Global / Por cuenta (con el selector de cuenta),
 * selector de mes con flechas y Rango, tarjeta principal de marca con el Profit sobre lo esperado y la línea
 * Recibido / Pendiente, y el mosaico Ingresos, Personal, Gastos, Recurrentes y Exportar (cada uno con su permiso).
 * La alerta de margen (D-010) va en una tarjeta ámbar.
 */
export default function AccountingScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const sd = useServiceDaysStrings();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const { period, setPeriod, jobsiteId, setJobsiteId, params } = usePeriod();
  const [mode, setMode] = useState<'global' | 'account'>(jobsiteId || !acc.global ? 'account' : 'global');
  const [jobsites, setJobsites] = useState<AccountingJobsite[]>([]);
  const [data, setData] = useState<DashboardFigures | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeRecurring, setActiveRecurring] = useState<number | null>(null);
  const seesFigures = mode === 'global' ? acc.global : acc.account && jobsiteId !== null;

  useEffect(() => {
    if (!acc.account) return;
    void fetchAccountingJobsites().then((r) => r.ok && setJobsites(r.data));
  }, [acc.account]);

  const load = useCallback(async () => {
    if (!seesFigures) {
      setData(null);
      return;
    }
    const r = await fetchDashboard(period, mode === 'account' ? jobsiteId : null);
    setFailed(!r.ok);
    setData(r.ok ? r.data : null);
  }, [period, mode, jobsiteId, seesFigures]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (acc.recurring) void fetchRecurring().then((r) => r.ok && setActiveRecurring(r.data.filter((x) => x.active).length));
    }, [load, acc.recurring]),
  );

  if (!canAny(access, ACCOUNTING_KEYS)) return <Redirect href="/" />;

  // Con la cuenta elegida, las pantallas de detalle se abren filtradas a esa cuenta.
  const scope = mode === 'account' ? jobsiteId : null;
  const go = (pathname: '/accounting/income' | '/accounting/staff' | '/accounting/expenses' | '/accounting/recurring' | '/accounting/export') =>
    router.push({ pathname, params: params(period, pathname === '/accounting/recurring' || pathname === '/accounting/export' ? null : scope) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={a.title} />
      <ScrollView contentContainerStyle={styles.page}>
        {acc.global && acc.account ? (
          <Segmented
            options={[
              { value: 'global', label: a.global },
              { value: 'account', label: a.byAccount },
            ]}
            value={mode}
            onChange={(v) => setMode(v)}
          />
        ) : null}
        {mode === 'account' && acc.account ? (
          <SelectField
            label={a.account}
            options={[{ value: '', label: a.chooseAccount }, ...jobsites.map((j) => ({ value: j.id, label: `${j.name} · ${j.client}` }))]}
            value={jobsiteId ?? ''}
            onChange={(v) => setJobsiteId(v || null)}
          />
        ) : null}
        <PeriodBar period={period} onChange={setPeriod} />
        {failed ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        <Bento>
          {seesFigures && data ? (
            <Card tone="brand" wide style={styles.main}>
              <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                {isRange(period) ? a.profitRange : a.profitMonth}
              </AppText>
              <AppText weight="heavy" size={32} color="#FFFFFF">
                {money(data.profit)}
              </AppText>
              <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                {a.receivedPending(money(data.received), money(data.pending))}
              </AppText>
              <AppText size={12} color="#FFFFFF" style={{ opacity: 0.7 }}>
                {a.profitNote}
              </AppText>
            </Card>
          ) : null}
          {seesFigures && data && data.atRisk.length > 0 ? (
            <Card tone="attention" wide style={styles.row}>
              <QuoteDueIcon />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="bold" size={15}>
                  {a.marginRisk}
                </AppText>
                <AppText size={12} color={colors.attentionText}>
                  {a.marginRiskLine(data.atRisk.map((x) => x.name).join(', '))}
                </AppText>
              </View>
            </Card>
          ) : null}
          {acc.income ? (
            <Tile tone="plain" icon={<ChartIcon />} title={a.income} figure={seesFigures && data ? money(data.expected) : null} onPress={() => go('/accounting/income')} />
          ) : null}
          {acc.staff ? (
            <Tile tone="plain" icon={<PeopleIcon />} title={a.staff} figure={seesFigures && data ? money(data.staff) : null} onPress={() => go('/accounting/staff')} />
          ) : null}
          {acc.staff ? (
            // D-286 (4): estado de cuenta del mes de los 1099.
            <Tile tone="plain" icon={<PeopleIcon />} title={sd.statementTitle} line={sd.statementRow} onPress={() => router.push('/accounting/statement')} />
          ) : null}
          {acc.expenses ? (
            <Tile tone="plain" icon={<DocIcon />} title={a.expenses} figure={seesFigures && data ? money(data.expenses) : null} onPress={() => go('/accounting/expenses')} />
          ) : null}
          {acc.recurring ? (
            <Tile
              tone="plain"
              icon={<ClockIcon />}
              title={a.recurring}
              line={activeRecurring === null ? null : a.recurringCount(activeRecurring)}
              onPress={() => go('/accounting/recurring')}
            />
          ) : null}
          {acc.export ? (
            <Card tone="dark" wide onPress={() => go('/accounting/export')} accessibilityLabel={a.export} style={styles.row}>
              <Icon name="share" size={22} strokeWidth={iconStrokeWidth} color={colors.darkCardText} />
              <View style={{ flex: 1 }}>
                <AppText weight="heavy" size={15} color={colors.darkCardText}>
                  {a.export}
                </AppText>
                <AppText size={12} color={colors.darkCardText} style={{ opacity: 0.75 }}>
                  {a.exportLine}
                </AppText>
              </View>
              <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.darkCardText} />
            </Card>
          ) : null}
        </Bento>
      </ScrollView>
    </View>
  );
}

/** Tarjeta del mosaico (D-068): nombre y cifra de 20px/800, o una línea. */
function Tile({ tone, icon, title, figure, line, onPress }: { tone: CardTone; icon: ReactNode; title: string; figure?: string | null; line?: string | null; onPress: () => void }) {
  const t = useCardText(tone);
  return (
    <Card tone={tone} onPress={onPress} accessibilityLabel={figure ? `${title}: ${figure}` : title} style={styles.tile}>
      {icon}
      <View style={{ gap: 2 }}>
        <AppText weight="heavy" size={15} color={t.main}>
          {title}
        </AppText>
        {figure ? (
          <AppText weight="heavy" size={20} color={t.main}>
            {figure}
          </AppText>
        ) : null}
        {line ? (
          <AppText size={12} color={t.soft} style={{ opacity: t.softOpacity }}>
            {line}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  main: { padding: 18, gap: 4 },
  tile: { gap: 12, minHeight: 124, justifyContent: 'space-between' },
  row: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
