import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { FormScroll } from '@/components/FormScroll';
import { TopBar } from '@/components/TopBar';
import { VisitApprovalCard } from '@/components/work/VisitApprovalCard';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { useGoBack } from '@/lib/navigation';
import { fetchVisitWork, type VisitCard } from '@/lib/scheduleApi';
import { usePermissions } from '@/lib/session';
import { canAny } from '@/lib/visibility';
import { useTheme } from '@/theme';

/**
 * Trabajo de una visita: la misma tarjeta de "To approve" (D-266) con Edit, No show, + Agregar persona y Approve.
 * También abre visitas aprobadas; ahí solo el Super Admin sigue corrigiendo (D-262).
 */
export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const [work, setWork] = useState<VisitCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchVisitWork(id);
    if (r.ok) setWork(r.data);
    else setError(t.errorLoad);
  }, [id, t.errorLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!canAny(access, ['work_aprobar', 'work_editar', 'work_revisar_gps', 'work_registrar_por_otros'])) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.workTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {error ? <AppAlert tone="error" text={error} /> : null}
        {work ? <VisitApprovalCard card={work} onChanged={load} onError={setError} onApproved={goBack} /> : null}
      </FormScroll>
    </View>
  );
}
