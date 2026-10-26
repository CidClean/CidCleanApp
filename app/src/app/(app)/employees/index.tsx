import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import { rowStyles } from '@/components/ListRow';
import { BackHeader } from '@/components/bento/Header';
import { StatRow } from '@/components/bento/Stats';
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
      <BackHeader
        title={strings.nav.employees}
        onBack={goBack}
        backLabel={strings.common.back}
        action={canCreateEmployees(access) ? { icon: 'plus', label: strings.newEmployee.title, onPress: () => router.push('/employees/new') } : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
        {employees ? (
          <StatRow
            stats={[
              { value: employees.filter((e) => e.active).length, label: strings.employees.statActive, tone: 'brand' },
              { value: employees.filter((e) => !e.active).length, label: strings.employees.statInactive, tone: 'plain' },
            ]}
          />
        ) : null}
        {failed ? <AppAlert tone="error" text={strings.employees.errorLoad} /> : null}
        {employees === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {employees && employees.length > 0 ? (
        <CardBlock>
        {employees.map((e, i) => (
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
        </CardBlock>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  texts: { flex: 1 },
});
