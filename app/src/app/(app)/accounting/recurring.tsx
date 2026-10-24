import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchRecurring, type Recurring } from '@/lib/accountingApi';
import { accountingAccess, money, recurringLine } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Gastos recurrentes (D-066, ronda 7): filas con nombre, frecuencia debajo y el monto a la derecha; los pausados con
 * la ficha Pausado. + abre el formulario de D-103; tocar una fila la edita (ahí se pausa con Activo).
 */
export default function RecurringScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const [rows, setRows] = useState<Recurring[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!acc.recurring) return;
      void fetchRecurring().then((r) => {
        setFailed(!r.ok);
        if (r.ok) setRows(r.data);
      });
    }, [acc.recurring]),
  );

  if (!acc.recurring) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={goBack}
        backLabel={strings.common.back}
        title={a.recurringTitle}
        action={{ label: a.newRecurring, icon: 'plus', onPress: () => router.push('/accounting/recurring-edit') }}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {failed ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {rows && rows.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {a.noRecurring}
          </AppText>
        ) : null}
        {rows && rows.length > 0 ? (
          <CardBlock>
            {rows.map((r, i) => (
              <ListRow
                key={r.id}
                title={r.name}
                detail={[recurringLine(r, a), r.jobsite].filter(Boolean).join(' · ')}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <AppText weight="bold">{money(r.amount)}</AppText>
                    {r.active ? null : <Chip label={a.paused} tone="muted" />}
                  </View>
                }
                chevron
                last={i === rows.length - 1}
                onPress={() => router.push({ pathname: '/accounting/recurring-edit', params: { id: r.id } })}
              />
            ))}
          </CardBlock>
        ) : null}
        <AppText size={sample.noteSize} color={colors.secondary}>
          {a.recurringNote}
        </AppText>
      </ScrollView>
    </View>
  );
}
