import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import { rowStyles } from '@/components/ListRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { canCreateEmployees, type Employee } from '@/lib/employeeRules';
import { subtitle } from '@/lib/employeeLabels';
import { fetchEmployees } from '@/lib/employeesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/** Lista de empleados (D-083): círculo de 36px con iniciales, nombre, "Tipo · Rol" y ficha de estado; icono + con permiso de crear (D-185). */
export default function EmployeesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access, can } = usePermissions();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchEmployees().then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setEmployees(result.data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!can('empleados_ver')) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={strings.nav.employees}
        onBack={goBack}
        backLabel={strings.common.back}
        action={
          canCreateEmployees(access)
            ? { icon: 'plus', onPress: () => router.push('/employees/new'), accessibilityLabel: strings.newEmployee.title }
            : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {failed ? <AppAlert tone="error" text={strings.employees.errorLoad} /> : null}
        {employees?.map((e, i) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/employees/[id]', params: { id: e.id } })}
            style={[
              rowStyles.base,
              { borderBottomColor: colors.border, borderBottomWidth: i === employees.length - 1 ? 0 : 0.5 },
            ]}
          >
            <View style={styles.who}>
              <Avatar name={e.fullName} size={36} />
              <View style={styles.texts}>
                <AppText weight="medium">{e.fullName}</AppText>
                <AppText size={sample.noteSize} color={colors.secondary}>
                  {subtitle(strings, e)}
                </AppText>
              </View>
            </View>
            <Chip
              label={e.active ? strings.employees.active : strings.employees.inactive}
              tone={e.active ? 'success' : 'neutral'}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  texts: { flex: 1 },
});
