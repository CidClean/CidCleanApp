import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { SelectField } from '@/components/SelectField';
import type { AddressStrings } from '@/i18n/address';
import { addressErrors, formatAddressLine, parseAddress, type AddressErrors, type AddressParts } from '@/lib/address';
import { US_STATES } from '@/lib/usStates';
import { sample, useTheme } from '@/theme';

/**
 * Campos de dirección únicos de la app (D-301): Dirección, Dirección 2, State (lista de 50 estados + DC), City y
 * ZIP code, en el orden y con los textos del formulario del empleado (D-264). `optional` agrega la opción "—" en State.
 */
export function AddressFields<T extends AddressParts>({
  form,
  onChange,
  t,
  errors = {},
  optional = false,
}: {
  form: T;
  onChange: (next: T) => void;
  t: AddressStrings;
  errors?: AddressErrors;
  optional?: boolean;
}) {
  const { status } = useTheme();
  const states = US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));
  return (
    <View>
      <AppField
        label={t.address1}
        value={form.addressLine1}
        onChangeText={(v) => onChange({ ...form, addressLine1: v })}
        autoComplete="address-line1"
        maxLength={120}
        error={errors.addressLine1 ? t.errorAddress1 : null}
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
        options={optional ? [{ value: '', label: t.noState }, ...states] : states}
        value={form.state}
        onChange={(v) => onChange({ ...form, state: v })}
      />
      {errors.state ? (
        <AppText size={sample.noteSize} color={status.error} style={{ marginTop: -4, marginBottom: 8 }}>
          {t.errorState}
        </AppText>
      ) : null}
      <AppField
        label={t.city}
        value={form.city}
        onChangeText={(v) => onChange({ ...form, city: v })}
        autoCapitalize="words"
        maxLength={80}
        error={errors.city ? t.errorCity : null}
      />
      <AppField
        label={t.zip}
        value={form.zip}
        onChangeText={(v) => onChange({ ...form, zip: v })}
        keyboardType="numbers-and-punctuation"
        autoComplete="postal-code"
        maxLength={10}
        error={errors.zip ? t.errorZip : null}
      />
    </View>
  );
}

/** Aviso ámbar corto de una dirección vieja sin separar (D-301), con acceso a editar si hay permiso. */
export function AddressReviewNote({ t, onEdit, label }: { t: AddressStrings; onEdit?: () => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.amber, { backgroundColor: colors.attention }]}>
      <AppText size={13} color={colors.attentionText} style={{ flexShrink: 1 }}>
        <AppText size={13} weight="heavy" color={colors.attentionText}>
          {label ? `${label} · ` : ''}
          {t.needsReviewTitle}
        </AppText>{' '}
        {t.needsReview}
      </AppText>
      {onEdit ? (
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <AppText size={13} weight="bold" color={colors.attentionText}>
            {t.edit}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amber: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
});

/**
 * Dirección guardada como texto de una línea (campos del contrato y del ICA, D-301): se muestra con los mismos campos
 * y se vuelve a unir como "calle, dirección 2, City, ST ZIP". `label` es el nombre del campo del documento.
 */
export function AddressTextFields({
  label,
  value,
  onChange,
  t,
  missing,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  t: AddressStrings;
  missing?: string | null;
}) {
  const { colors, status } = useTheme();
  const [parts, setParts] = useState<AddressParts>(() => parseAddress(value).parts);
  // Si el texto cambia desde fuera (se cargan los campos del documento), se vuelve a separar.
  if (formatAddressLine(parts) !== value.trim()) setParts(parseAddress(value).parts);
  const errors = value.trim() ? addressErrors(parts, 'optional') : {};
  return (
    <View style={{ marginBottom: 4 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 4 }}>
        {label}
      </AppText>
      <AddressFields
        form={parts}
        onChange={(next) => {
          setParts(next);
          onChange(formatAddressLine(next));
        }}
        t={t}
        errors={errors}
      />
      {missing ? (
        <AppText size={sample.noteSize} color={status.error} style={{ marginTop: -4, marginBottom: 8 }}>
          {missing}
        </AppText>
      ) : null}
    </View>
  );
}
