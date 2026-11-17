import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ListRow } from '../ListRow';
import { useEmailTemplatesStrings } from '@/i18n/useEmailTemplatesStrings';
import { fetchTemplates } from '@/lib/emailTemplatesApi';

/** Fila de Ajustes "Plantillas de correo" (D-323 (2)) con la cantidad de plantillas y flecha. */
export function EmailTemplatesSettingsRow({ last = false }: { last?: boolean }) {
  const router = useRouter();
  const t = useEmailTemplatesStrings();
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([fetchTemplates('prospect', false), fetchTemplates('client', false)]).then(([a, b]) => {
        if (!cancelled && a.ok && b.ok) setCount(a.data.length + b.data.length);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <ListRow
      title={t.row}
      detail={count === null ? '' : t.rowDetail(count)}
      chevron
      last={last}
      onPress={() => router.push('/settings/email-templates')}
    />
  );
}
