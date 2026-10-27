import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ListRow } from '../ListRow';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { fetchExpenseCategories } from '@/lib/accountingApi';
import { activeReasons } from '@/lib/leadRules';

/** Fila de Ajustes "Categorías de gastos" con la cantidad de categorías activas y flecha (D-107, D-113, D-130, D-254). */
export function ExpenseCategoriesSettingsRow({ last = false }: { last?: boolean }) {
  const router = useRouter();
  const a = useAccountingStrings();
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchExpenseCategories().then((result) => {
        if (!cancelled && result.ok) setCount(activeReasons(result.data).length);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <ListRow
      title={a.categories.row}
      detail={count === null ? '' : a.categories.count(count)}
      chevron
      last={last}
      onPress={() => router.push('/settings/expense-categories')}
    />
  );
}
