import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AddressFields } from '@/components/employees/AddressFields';
import { PhoneField } from '@/components/PhoneField';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import {
  canCreateEmployees,
  emptyNewEmployee,
  hasErrors,
  validateNewEmployee,
  type NewEmployeeErrors,
  type NewEmployeeForm,
} from '@/lib/employeeRules';
import { roleLabel } from '@/lib/employeeLabels';
import { createEmployee } from '@/lib/employeesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/** Nuevo empleado (D-171, D-264): una sola pantalla; el correo aparece solo con acceso a la app. Al crear abre su perfil (D-181). */
export default function NewEmployeeScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const [form, setForm] = useState<NewEmployeeForm>(emptyNewEmployee);
  const [errors, setErrors] = useState<NewEmployeeErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<'taken' | 'forbidden' | 'generic' | null>(null);

  if (!canCreateEmployees(access)) return <Redirect href="/" />;

  const set = <K extends keyof NewEmployeeForm>(key: K, value: NewEmployeeForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (saving) return;
    const found = validateNewEmployee(form);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setSaving(true);
    const result = await createEmployee(form);
    setSaving(false);
    if (!result.ok) {
      setFailure(result.reason === 'email_taken' ? 'taken' : result.reason === 'forbidden' ? 'forbidden' : 'generic');
      return;
    }
    // D-181: al terminar se abre su perfil, pestaña Datos.
    router.replace({
      pathname: '/employees/[id]',
      params: { id: result.data.id, invitation: result.data.invitation },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.newEmployee.title} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {/* D-264: Nombre, Apellidos, Teléfono, Email, Dirección, Dirección 2, State, City y ZIP code, en este orden.
            D-200: la casilla de acceso va justo antes del Email (que aparece solo con acceso, D-171); Tipo y Rol después. */}
        <AppField
          label={strings.newEmployee.firstName}
          value={form.firstName}
          onChangeText={(v) => set('firstName', v)}
          autoCapitalize="words"
          autoComplete="given-name"
          maxLength={60}
          error={errors.firstName ? strings.newEmployee.errorName : null}
        />
        <AppField
          label={strings.newEmployee.lastName}
          value={form.lastName}
          onChangeText={(v) => set('lastName', v)}
          autoCapitalize="words"
          autoComplete="family-name"
          maxLength={60}
          error={errors.lastName ? strings.newEmployee.errorLastName : null}
        />
        <PhoneField
          label={strings.newEmployee.phone}
          value={form.phone}
          onChange={(v) => set('phone', v)}
          error={errors.phone ? strings.common.phoneError : null}
        />
        <Checkbox
          label={strings.newEmployee.hasAccess}
          checked={form.hasAppAccess}
          onChange={(v) => set('hasAppAccess', v)}
        />
        {form.hasAppAccess ? (
          <AppField
            label={strings.newEmployee.email}
            value={form.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            error={
              errors.email
                ? strings.email.invalid
                : failure === 'taken'
                  ? strings.newEmployee.errorEmailTaken
                  : null
            }
          />
        ) : null}
        <AddressFields form={form} onChange={setForm} strings={strings} zipError={Boolean(errors.zip)} />
        <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
          {strings.newEmployee.type}
        </AppText>
        <Segmented
          options={[
            { value: 'w2', label: strings.employees.w2 },
            { value: '1099', label: strings.employees.contractor },
          ]}
          value={form.workerType}
          onChange={(v) => set('workerType', v)}
        />
        <SelectField
          label={strings.newEmployee.role}
          options={[
            { value: 'employee', label: roleLabel(strings, 'employee') },
            { value: 'supervisor', label: roleLabel(strings, 'supervisor') },
            { value: 'admin', label: roleLabel(strings, 'admin') },
          ]}
          value={form.role}
          onChange={(v) => set('role', v)}
        />
        <SelectField
          label={strings.newEmployee.language}
          options={[
            { value: 'en', label: strings.profile.english },
            { value: 'es', label: strings.profile.spanish },
          ]}
          value={form.language}
          onChange={(v) => set('language', v)}
        />
        <View style={{ height: 4 }} />
        {failure === 'forbidden' || failure === 'generic' ? (
          <AppAlert
            tone="error"
            text={failure === 'forbidden' ? strings.newEmployee.errorForbidden : strings.newEmployee.errorCreate}
          />
        ) : null}
        <AppButton label={strings.newEmployee.create} onPress={() => void submit()} disabled={saving} />
      </FormScroll>
    </View>
  );
}
