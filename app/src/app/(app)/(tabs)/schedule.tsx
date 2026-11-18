import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AccountButton } from '@/components/AccountButton';
import { TitleHeader } from '@/components/bento/Header';
import { ScheduleWorkPanel, WORK_KEYS } from '@/components/work/ScheduleWorkPanel';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { usePermissions } from '@/lib/session';
import { can, canAny } from '@/lib/visibility';
import { useTheme } from '@/theme';

/**
 * Schedule & Work (D-214, D-235), pestaña de la barra inferior desde D-337: todos los jobsites. El contenido es el
 * mismo que dentro de cada jobsite (`ScheduleWorkPanel`); aquí además está el + para una visita a mano y el avatar
 * de Mi cuenta. `?tab=approve` (desde el Inicio) abre Por aprobar.
 */
export default function ScheduleScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const seesSchedule = can(access, 'schedule_ver_editar');
  const seesWork = canAny(access, WORK_KEYS);

  if (!seesSchedule && !seesWork) return <Redirect href="/" />;
  const initial = params.tab === 'approve' ? 'approve' : 'schedule';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        title={t.title}
        action={seesSchedule ? { icon: 'plus', label: t.newVisit, onPress: () => router.push('/schedule/new') } : undefined}
        right={<AccountButton />}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {/* Como pestaña la pantalla no se vuelve a montar: la clave hace que un ?tab nuevo abra esa sección. */}
        <ScheduleWorkPanel key={initial} initialTab={initial} />
      </ScrollView>
    </View>
  );
}
