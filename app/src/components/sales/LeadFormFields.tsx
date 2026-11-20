import { View } from 'react-native';

import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Segmented } from '../Segmented';
import { PhoneField } from '../PhoneField';
import { DateField } from '../PickerField';
import { SelectField } from '../SelectField';
import type { SalesStrings } from '@/i18n/sales';
import { useStrings } from '@/i18n/useStrings';
import {
  dateFromKey,
  formatShortDate,
  formatUsDate,
  isResidentialForm,
  parseUsDate,
  withService,
  type LeadForm,
  type LeadFormErrors,
  type LeadSource,
} from '@/lib/leadRules';
import { useTheme } from '@/theme';

/** Fuentes que se eligen a mano; anuncios y agentes solo llegan por la entrada segura (orden 160). */
const MANUAL_SOURCES: readonly LeadSource[] = ['manual', 'web', 'campaign'];

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
  const strings = useStrings();
  const { colors } = useTheme();
  const residential = isResidentialForm(form);
  const sources = MANUAL_SOURCES.includes(form.source) ? MANUAL_SOURCES : [...MANUAL_SOURCES, form.source];
  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => onChange({ ...form, [key]: value });
  const data = part !== 'notes';
  const notes = part !== 'data';
  return (
    <>
      {data ? (
        <>
          {/* D-350 (3): Service Recurring / One-time; Property solo con One-time. */}
          <View>
            <AppText size={13} weight="medium" color={colors.secondary} style={{ marginBottom: 6 }}>
              {s.origin.service}
            </AppText>
            <Segmented
              options={[
                { value: 'recurring', label: s.origin.recurring },
                { value: 'one_time', label: s.origin.oneTime },
              ]}
              value={form.service}
              onChange={(v) => onChange(withService(form, v))}
            />
          </View>
          {form.service === 'one_time' ? (
            <View>
              <AppText size={13} weight="medium" color={colors.secondary} style={{ marginBottom: 6 }}>
                {s.origin.property}
              </AppText>
              <Segmented
                options={[
                  { value: 'non_residential', label: s.origin.commercial },
                  { value: 'residential', label: s.origin.residential },
                ]}
                value={form.cleaningType}
                onChange={(v) => set('cleaningType', v)}
              />
            </View>
          ) : null}
          <AppField
            label={residential ? s.origin.companyOptional : s.form.company}
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
            error={errors.contactName ? s.origin.errorContact : null}
          />
          <PhoneField
            label={s.form.phone}
            value={form.phone}
            onChange={(v) => set('phone', v)}
            error={errors.phone ? strings.common.phoneError : null}
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
            options={sources.map((v) => ({ value: v, label: s.source[v] }))}
            value={form.source}
            onChange={(v) => set('source', v)}
          />
          <SelectField
            label={s.form.language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Español' },
            ]}
            value={form.language}
            onChange={(v) => set('language', v)}
          />
          {/* D-216: la fecha se elige en el calendario, no se escribe. */}
          <DateField
            label={s.form.followUp}
            value={followUpKey(form.followUp)}
            onChange={(key) => set('followUp', formatUsDate(key))}
            format={(key) => {
              const d = dateFromKey(key);
              const short = formatShortDate(d, s);
              return d.getFullYear() === new Date().getFullYear() ? short : `${short} ${d.getFullYear()}`;
            }}
            placeholder={strings.common.noDate}
            calendar={{ months: s.schedule.months, weekDays: s.schedule.weekDays, previousMonth: s.schedule.previousMonth, nextMonth: s.schedule.nextMonth }}
            clearLabel={strings.common.clearDate}
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

function followUpKey(text: string): string | null {
  const key = parseUsDate(text);
  return key === 'invalid' ? null : key;
}
