import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ListRow } from '../ListRow';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { activeReasons } from '@/lib/leadRules';
import { fetchLostReasons } from '@/lib/leadsApi';

/** Fila de Ajustes "Motivos de lead perdido" con la cantidad de motivos y flecha (D-107, D-203). */
export function LostReasonsSettingsRow({ last = false }: { last?: boolean }) {
  const router = useRouter();
  const s = useSalesStrings();
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchLostReasons().then((result) => {
        if (!cancelled && result.ok) setCount(activeReasons(result.data).length);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <ListRow
      title={s.reasons.row}
      detail={count === null ? '' : s.reasons.count(count)}
      chevron
      last={last}
      onPress={() => router.push('/settings/lost-reasons')}
    />
  );
}
