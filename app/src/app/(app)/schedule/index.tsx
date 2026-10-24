import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { TopBar } from '@/components/TopBar';
import { ScheduleWorkPanel, WORK_KEYS } from '@/components/work/ScheduleWorkPanel';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { can, canAny } from '@/lib/visibility';
import { useTheme } from '@/theme';

/**
 * Schedule & Work del menú (D-214, D-235): todos los jobsites. El contenido es el mismo que dentro de cada jobsite
 * (`ScheduleWorkPanel`); aquí además está el + para una visita a mano.
 */
export default function ScheduleScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const seesSchedule = can(access, 'schedule_ver_editar');
  const seesWork = canAny(access, WORK_KEYS);

  if (!seesSchedule && !seesWork) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t.title}
        onBack={goBack}
        backLabel={strings.common.back}
        action={seesSchedule ? { icon: 'plus', accessibilityLabel: t.newVisit, onPress: () => router.push('/schedule/new') } : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <ScheduleWorkPanel initialTab={params.tab === 'approve' ? 'approve' : 'schedule'} />
      </ScrollView>
    </View>
  );
}
