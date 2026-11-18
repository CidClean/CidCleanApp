import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import { rowStyles } from '@/components/ListRow';
import { BackHeader } from '@/components/bento/Header';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { useStrings } from '@/i18n/useStrings';
import { canCreateEmployees, listEmployees, type Employee, type EmployeeSort, type EmployeeTypeFilter } from '@/lib/employeeRules';
import { subtitle } from '@/lib/employeeLabels';
import { fetchEmployees } from '@/lib/employeesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Lista de empleados (D-083): círculo de 36px con iniciales, nombre, "Tipo · Rol" y ficha de estado; icono + con permiso
 * de crear (D-185). D-337: Activos / Inactivos son pestañas que filtran (por defecto Activos), buscador, y orden por
 * Nombre, Tipo o Rol y filtro por tipo (Todos / 1099 / W-2) en dos botones compactos que abren la ventana de opciones
 * (D-200, sin pastillas).
 */
export default function EmployeesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access, can } = usePermissions();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<EmployeeSort>('name');
  const [type, setType] = useState<EmployeeTypeFilter>('all');
  const t = strings.employees;

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
  const shown = employees ? listEmployees(employees, { active: tab === 'active', query, sort, type }) : null;

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
          <View style={{ gap: 10, marginBottom: 12 }}>
            <Segmented
              options={[
                { value: 'active', label: t.tabActive(employees.filter((e) => e.active).length) },
                { value: 'inactive', label: t.tabInactive(employees.filter((e) => !e.active).length) },
              ]}
              value={tab}
              onChange={setTab}
            />
            <View style={[styles.search, { backgroundColor: colors.card }]}>
              <Icon name="search" size={18} strokeWidth={iconStrokeWidth} color={colors.secondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t.search}
                placeholderTextColor={colors.secondary}
                accessibilityLabel={t.search}
                autoCorrect={false}
                style={[styles.searchInput, { color: colors.text }]}
              />
            </View>
            <View style={styles.controls}>
              <SelectField
                label={t.sortLabel}
                options={[
                  { value: 'name', label: t.sortName },
                  { value: 'type', label: t.sortType },
                  { value: 'role', label: t.sortRole },
                ]}
                value={sort}
                onChange={setSort}
                renderTrigger={(current, open) => <Compact label={t.sortButton(current)} icon="arrows-sort" onPress={open} />}
              />
              <SelectField
                label={t.typeLabel}
                options={[
                  { value: 'all', label: t.typeAll },
                  { value: '1099', label: t.contractor },
                  { value: 'w2', label: t.w2 },
                ]}
                value={type}
                onChange={setType}
                renderTrigger={(current, open) => <Compact label={t.typeButton(current)} icon="chevron-down" onPress={open} />}
              />
            </View>
          </View>
        ) : null}
        {failed ? <AppAlert tone="error" text={strings.employees.errorLoad} /> : null}
        {employees === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {shown && shown.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {t.noResults}
          </AppText>
        ) : null}
        {shown && shown.length > 0 ? (
        <CardBlock>
        {shown.map((e, i) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/employees/[id]', params: { id: e.id } })}
            style={[
              rowStyles.base,
              { borderBottomColor: colors.border, borderBottomWidth: i === shown.length - 1 ? 0 : 0.5 },
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

/** Botón compacto (D-200): texto de 13px con icono, sobre tarjeta blanca de 36px. */
function Compact({ label, icon, onPress }: { label: string; icon: 'arrows-sort' | 'chevron-down'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.compact, { backgroundColor: colors.card }]}>
      <AppText weight="medium" size={13}>
        {label}
      </AppText>
      <Icon name={icon} size={16} strokeWidth={iconStrokeWidth} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  controls: { flexDirection: 'row', gap: 8 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 12, paddingHorizontal: 12 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  texts: { flex: 1 },
});
