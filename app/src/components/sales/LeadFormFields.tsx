import { AppField } from '../AppField';
import { SelectField } from '../SelectField';
import type { SalesStrings } from '@/i18n/sales';
import { LEAD_SOURCES, type LeadForm, type LeadFormErrors } from '@/lib/leadRules';

type Props = {
  form: LeadForm;
  errors: LeadFormErrors;
  onChange: (form: LeadForm) => void;
  s: SalesStrings;
  /** Qué partes: los datos (pestaña Datos), las notas (pestaña Notas) o todo (Nuevo lead). */
  part?: 'all' | 'data' | 'notes';
};

/** Campos del lead (flujo, "Ventas 1: Lead"): empresa, persona de contacto, teléfono, email, fuente, seguimiento y notas. */
export function LeadFormFields({ form, errors, onChange, s, part = 'all' }: Props) {
  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => onChange({ ...form, [key]: value });
  const data = part !== 'notes';
  const notes = part !== 'data';
  return (
    <>
      {data ? (
        <>
          <AppField
            label={s.form.company}
            value={form.company}
            onChangeText={(v) => set('company', v)}
            autoCapitalize="words"
            error={errors.company ? s.form.errorCompany : null}
          />
          <AppField
            label={s.form.contact}
            value={form.contactName}
            onChangeText={(v) => set('contactName', v)}
            autoCapitalize="words"
            autoComplete="name"
          />
          <AppField
            label={s.form.phone}
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <AppField
            label={s.form.email}
            value={form.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            error={errors.email ? s.form.errorEmail : null}
          />
          <SelectField
            label={s.form.source}
            options={LEAD_SOURCES.map((v) => ({ value: v, label: s.source[v] }))}
            value={form.source}
            onChange={(v) => set('source', v)}
          />
          <AppField
            label={s.form.followUp}
            value={form.followUp}
            onChangeText={(v) => set('followUp', v)}
            placeholder={s.form.followUpPlaceholder}
            keyboardType="numbers-and-punctuation"
            error={errors.followUp ? s.form.errorDate : null}
          />
        </>
      ) : null}
      {notes ? (
        <AppField
          label={s.form.notes}
          value={form.notes}
          onChangeText={(v) => set('notes', v)}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 96 }}
        />
      ) : null}
    </>
  );
}
