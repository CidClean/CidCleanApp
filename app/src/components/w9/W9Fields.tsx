import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { Icon } from '@/components/Icon';
import { SelectField } from '@/components/SelectField';
import type { W9AdminStrings } from '@/i18n/w9';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, type Classification, type LlcLetter, type W9Data, type W9Error } from '@/lib/w9Rules';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

type Props = { value: W9Data; onChange: (next: W9Data) => void; t: W9AdminStrings; errors?: readonly W9Error[] };

/** Texto del error de un campo (o null). */
export function w9ErrorText(t: W9AdminStrings, errors: readonly W9Error[] | undefined, e: W9Error): string | null {
  if (!errors?.includes(e)) return null;
  return {
    name: t.needName, llc: t.needLlc, other: t.needOther, exempt: t.badExempt, fatca: t.badFatca,
    address: t.needAddress, city: t.needCity, accounts: t.tooLong, long: t.tooLong,
  }[e];
}

/** Línea 3a como selección con las 7 opciones del formulario (D-257): la letra del LLC y el texto de Other debajo. */
export function W9ClassificationFields({ value, onChange, t, errors }: Props) {
  const set = (p: Partial<W9Data>) => onChange({ ...value, ...p });
  return (
    <View>
      <SelectField<Classification>
        label={t.line3a}
        options={CLASSIFICATIONS.map((c) => ({ value: c, label: CLASSIFICATION_LABELS[c] }))}
        value={value.classification}
        onChange={(c) => set({ classification: c })}
      />
      {value.classification === 'llc' ? (
        <SelectField<LlcLetter>
          label={t.llcLetter}
          options={[
            { value: '', label: '—' },
            { value: 'C', label: t.llcC },
            { value: 'S', label: t.llcS },
            { value: 'P', label: t.llcP },
          ]}
          value={value.llc}
          onChange={(l) => set({ llc: l })}
        />
      ) : null}
      {w9ErrorText(t, errors, 'llc') ? <ErrorLine text={w9ErrorText(t, errors, 'llc') as string} /> : null}
      {value.classification === 'other' ? (
        <AppField label={t.otherText} value={value.other} onChangeText={(v) => set({ other: v })} maxLength={60}
          error={w9ErrorText(t, errors, 'other')} />
      ) : null}
    </View>
  );
}

/** Líneas 5 y 6. */
export function W9AddressFields({ value, onChange, t, errors }: Props) {
  const set = (p: Partial<W9Data>) => onChange({ ...value, ...p });
  return (
    <View>
      <AppField label={t.line5} value={value.address} onChangeText={(v) => set({ address: v })} maxLength={120}
        autoComplete="street-address" error={w9ErrorText(t, errors, 'address')} />
      <AppField label={t.line6} value={value.city} onChangeText={(v) => set({ city: v })} maxLength={120}
        error={w9ErrorText(t, errors, 'city')} />
    </View>
  );
}

/**
 * "Más opciones (opcional)" (D-258): casilla 3b, línea 4 (exempt payee y FATCA) y línea 7, siempre presentes sin
 * importar la clasificación. Plegada al abrir (D-200); se abre sola si tiene datos o un error.
 */
export function W9MoreOptions({ value, onChange, t, errors }: Props) {
  const { colors } = useTheme();
  const filled = value.foreign_partners || !!value.exempt_payee || !!value.fatca || !!value.accounts;
  const hasError = !!errors?.some((e) => e === 'exempt' || e === 'fatca' || e === 'accounts');
  const [open, setOpen] = useState(filled);
  const shown = open || hasError;
  const set = (p: Partial<W9Data>) => onChange({ ...value, ...p });
  return (
    <View style={{ marginTop: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
        onPress={() => setOpen(!shown)}
        style={styles.head}
      >
        <AppText weight="medium" size={14}>
          {t.moreOptions}
        </AppText>
        <Icon name={shown ? 'chevron-down' : 'chevron-right'} size={18} strokeWidth={iconStrokeWidth} color={colors.secondary} />
      </Pressable>
      {shown ? (
        <View>
          <Checkbox label={t.line3b} checked={value.foreign_partners} onChange={(v) => set({ foreign_partners: v })} />
          <AppField label={t.exemptPayee} value={value.exempt_payee} onChangeText={(v) => set({ exempt_payee: v })}
            keyboardType="number-pad" maxLength={2} error={w9ErrorText(t, errors, 'exempt')} />
          <AppField label={t.fatca} value={value.fatca} onChangeText={(v) => set({ fatca: v.toUpperCase() })}
            autoCapitalize="characters" maxLength={1} error={w9ErrorText(t, errors, 'fatca')} />
          <AppField label={t.accounts} value={value.accounts} onChangeText={(v) => set({ accounts: v })} maxLength={100}
            error={w9ErrorText(t, errors, 'accounts')} />
        </View>
      ) : null}
    </View>
  );
}

/** Todos los campos del W-9 (la ventana del perfil): líneas 1, 2, 3a, 5, 6 y Más opciones. */
export function W9Fields(props: Props) {
  const { value, onChange, t, errors } = props;
  const set = (p: Partial<W9Data>) => onChange({ ...value, ...p });
  return (
    <View>
      <AppField label={t.line1} value={value.name} onChangeText={(v) => set({ name: v })} maxLength={120}
        autoCapitalize="words" error={w9ErrorText(t, errors, 'name')} />
      <AppField label={t.line2} value={value.business} onChangeText={(v) => set({ business: v })} maxLength={120} />
      <W9ClassificationFields {...props} />
      <W9AddressFields {...props} />
      <W9MoreOptions {...props} />
      {errors?.includes('long') ? <ErrorLine text={t.tooLong} /> : null}
    </View>
  );
}

function ErrorLine({ text }: { text: string }) {
  const { status } = useTheme();
  return (
    <AppText size={sample.noteSize} color={status.error} style={{ marginTop: -4, marginBottom: 8 }}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
});
