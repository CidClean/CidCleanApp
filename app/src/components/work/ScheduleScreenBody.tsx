import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/components/bento/Header';
import { ScheduleWorkPanel, WORK_KEYS } from '@/components/work/ScheduleWorkPanel';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { usePermissions } from '@/lib/session';
import { can, canAny } from '@/lib/visibility';
import { useTheme } from '@/theme';

/**
 * Schedule & Work (D-214, D-235). D-345: siempre con la flecha de volver; volver (flecha o botón del teléfono) lleva a la
 * pantalla anterior, sin recorridos forzados. Se usa en la pestaña de la barra y como pantalla abierta desde un jobsite.
 * `?tab=approve` (desde el Inicio) abre Por aprobar.
 */
export function ScheduleScreenBody() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const t = useWorkStrings();
  const strings = useStrings();
  const { access } = usePermissions();
  const seesSchedule = can(access, 'schedule_ver_editar');
  const seesWork = canAny(access, WORK_KEYS);

  if (!seesSchedule && !seesWork) return <Redirect href="/" />;
  const initial = params.tab === 'approve' ? 'approve' : 'schedule';
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={back}
        backLabel={strings.common.back}
        title={t.title}
        action={seesSchedule ? { label: t.newVisit, icon: 'plus', accessibilityLabel: t.newVisit, onPress: () => router.push('/schedule/new') } : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {/* Como pestaña la pantalla no se vuelve a montar: la clave hace que un ?tab nuevo abra esa sección. */}
        <ScheduleWorkPanel key={initial} initialTab={initial} />
      </ScrollView>
    </View>
  );
}
