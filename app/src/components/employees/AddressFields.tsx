import { View } from 'react-native';

import { AppField } from '@/components/AppField';
import { SelectField } from '@/components/SelectField';
import type { Strings } from '@/i18n/es';
import type { Address } from '@/lib/employeeRules';
import { US_STATES } from '@/lib/usStates';

/** Dirección del empleado (D-264): Dirección, Dirección 2, State (lista predefinida), City y ZIP code, en ese orden. */
export function AddressFields<T extends Address>({
  form,
  onChange,
  strings,
  zipError,
}: {
  form: T;
  onChange: (next: T) => void;
  strings: Strings;
  zipError: boolean;
}) {
  const t = strings.newEmployee;
  return (
    <View>
      <AppField
        label={t.address1}
        value={form.addressLine1}
        onChangeText={(v) => onChange({ ...form, addressLine1: v })}
        autoComplete="address-line1"
        maxLength={120}
      />
      <AppField
        label={t.address2}
        value={form.addressLine2}
        onChangeText={(v) => onChange({ ...form, addressLine2: v })}
        autoComplete="address-line2"
        maxLength={120}
      />
      <SelectField
        label={t.state}
        options={[{ value: '', label: t.noState }, ...US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))]}
        value={form.state}
        onChange={(v) => onChange({ ...form, state: v })}
      />
      <AppField
        label={t.city}
        value={form.city}
        onChangeText={(v) => onChange({ ...form, city: v })}
        autoCapitalize="words"
        maxLength={80}
      />
      <AppField
        label={t.zip}
        value={form.zip}
        onChangeText={(v) => onChange({ ...form, zip: v })}
        keyboardType="numbers-and-punctuation"
        autoComplete="postal-code"
        maxLength={10}
        error={zipError ? t.errorZip : null}
      />
    </View>
  );
}
