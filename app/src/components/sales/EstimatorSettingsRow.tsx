import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import { ListRow } from '../ListRow';
import { useEstimatorStrings } from '@/i18n/useEstimatorStrings';
import { usd } from '@/lib/estimator';
import { fetchEstimatorSettings } from '@/lib/estimatorApi';

/** Fila de Ajustes "Estimador del sitio" con el mínimo por visita vigente y flecha (orden 91). */
export function EstimatorSettingsRow() {
  const router = useRouter();
  const t = useEstimatorStrings();
  const [min, setMin] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchEstimatorSettings().then((result) => {
        if (!cancelled && result.ok) setMin(result.data.minPerVisit);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return <ListRow title={t.row} detail={min === null ? '' : t.rowDetail(usd(min))} chevron onPress={() => router.push('/settings/estimator' as Href)} />;
}
