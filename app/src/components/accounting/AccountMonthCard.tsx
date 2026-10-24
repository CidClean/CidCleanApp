import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { Card } from '../bento/Card';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { fetchDashboard } from '@/lib/accountingApi';
import { accountingAccess, monthKeyOf, monthTitle, money, type DashboardFigures } from '@/lib/accountingRules';
import { usePermissions } from '@/lib/session';
import { iconStrokeWidth, useTheme } from '@/theme';

/**
 * Lo del mes de la cuenta en el jobsite (orden 27): solo con el dashboard por cuenta y ver tarifa. Profit sobre lo
 * esperado, Esperado y la línea Recibido / Pendiente; abre Accounting en esa cuenta.
 */
export function AccountMonthCard({ jobsiteId }: { jobsiteId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const a = useAccountingStrings();
  const { access } = usePermissions();
  const allowed = accountingAccess(access).account;
  const [data, setData] = useState<DashboardFigures | null>(null);
  const month = monthKeyOf(new Date());

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      void fetchDashboard({ from: month, to: month }, jobsiteId).then((r) => !cancelled && r.ok && setData(r.data));
      return () => {
        cancelled = true;
      };
    }, [allowed, jobsiteId, month]),
  );

  if (!allowed || !data) return null;
  return (
    <Card
      wide
      onPress={() => router.push({ pathname: '/accounting', params: { from: month, to: month, jobsite: jobsiteId } })}
      accessibilityLabel={a.openAccounting}
      style={{ gap: 4, marginBottom: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={13} color={colors.secondary}>
          {a.accountCard(monthTitle(month, a))}
        </AppText>
        <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.secondary} />
      </View>
      <AppText size={13}>{`${a.profit} · ${a.profitNote}`}</AppText>
      <AppText weight="heavy" size={20}>
        {money(data.profit)}
      </AppText>
      <AppText size={12} color={colors.secondary}>
        {`${a.expected} ${money(data.expected)} · ${a.receivedPending(money(data.received), money(data.pending))}`}
      </AppText>
    </Card>
  );
}
