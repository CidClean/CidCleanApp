import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { Card, CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchExpenses, type Expense } from '@/lib/accountingApi';
import { accountingAccess, money, periodTitle } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { shortDate } from '@/lib/quoteRules';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Gastos (D-065, D-098): total del periodo y la lista (categoría, fecha, jobsite o Global, monto); con permiso de
 * registrar, + abre "Nuevo gasto" y tocar una fila la edita.
 */
export default function ExpensesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const { period, setPeriod, jobsiteId } = usePeriod();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchExpenses(period, jobsiteId);
    setFailed(!r.ok);
    if (r.ok) setRows(r.data);
  }, [period, jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!acc.expenses) return <Redirect href="/" />;
  const total = (rows ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={goBack}
        backLabel={strings.common.back}
        title={a.expensesTitle(periodTitle(period, a))}
        action={
          acc.editExpenses
            ? { label: a.newExpense, icon: 'plus', onPress: () => router.push({ pathname: '/accounting/expense', params: jobsiteId ? { jobsite: jobsiteId } : {} }) }
            : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.page}>
        <PeriodBar period={period} onChange={setPeriod} />
        {failed ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {rows === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        <Card wide style={{ marginBottom: 12, gap: 2 }}>
          <AppText size={13} color={colors.secondary}>
            {a.expenses}
          </AppText>
          <AppText weight="heavy" size={20}>
            {money(total)}
          </AppText>
        </Card>
        {rows && rows.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {a.noExpenses}
          </AppText>
        ) : null}
        {rows && rows.length > 0 ? (
          <CardBlock>
            {rows.map((e, i) => (
              <ListRow
                key={e.id}
                title={locale === 'es' ? e.categoryEs : e.categoryEn}
                detail={[shortDate(`${e.spentOn}T12:00:00`, locale), e.jobsite ?? a.globalExpense, e.recurring ? a.generated : null, e.note]
                  .filter(Boolean)
                  .join(' · ')}
                right={<AppText weight="bold">{money(e.amount)}</AppText>}
                chevron={acc.editExpenses}
                last={i === rows.length - 1}
                onPress={acc.editExpenses ? () => router.push({ pathname: '/accounting/expense', params: { id: e.id, month: e.spentOn.slice(0, 7) } }) : undefined}
              />
            ))}
          </CardBlock>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
});
