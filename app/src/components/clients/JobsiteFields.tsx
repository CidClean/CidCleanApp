import { StyleSheet, View } from 'react-native';

import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { PhoneField } from '../PhoneField';
import { SelectField } from '../SelectField';
import { UsDateField } from '../UsDateField';
import { useStrings } from '@/i18n/useStrings';
import { DayButtons } from '../walkthrough/DayButtons';
import type { ClientsStrings } from '@/i18n/clients';
import type { JobsiteErrors, JobsiteForm } from '@/lib/clientRules';
import { formatCoordinates, plusCodeToCoordinates } from '@/lib/plusCode';
import { sample, useTheme } from '@/theme';

type Props = { form: JobsiteForm; errors: JobsiteErrors; onChange: (f: JobsiteForm) => void; c: ClientsStrings; withRate: boolean };

/**
 * Datos del jobsite (D-210, D-211; diseño bajo D-208 con los campos aprobados): nombre, dirección, Plus Code (con las
 * coordenadas que calcula la app), contacto principal, contacto de emergencia (nombre, teléfono, relación y correo),
 * frecuencia (D-075, D-080, D-105), horas estimadas por visita, inicio del contrato y, al dar de alta, la tarifa.
 */
export function JobsiteFields({ form, errors, onChange, c, withRate }: Props) {
  const { colors } = useTheme();
  const strings = useStrings();
  const set = <K extends keyof JobsiteForm>(k: K, v: JobsiteForm[K]) => onChange({ ...form, [k]: v });
  const coords = form.plusCode.trim() ? plusCodeToCoordinates(form.plusCode) : null;
  const section = (label: string) => (
    <AppText size={sample.labelSize} color={colors.secondary} style={styles.section}>
      {label}
    </AppText>
  );
  const f = form.frequency;
  return (
    <>
      <AppField label={c.form.name} value={form.name} onChangeText={(v) => set('name', v)} error={errors.name ? c.form.errorName : null} />
      <AppField label={c.jobsite.address} value={form.address} onChangeText={(v) => set('address', v)} error={errors.address ? c.form.errorAddress : null} />
      <AppField
        label={c.jobsite.plusCode}
        value={form.plusCode}
        onChangeText={(v) => set('plusCode', v)}
        placeholder={c.jobsite.plusCodeHint}
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors.plusCode ? c.form.errorPlusCode : null}
      />
      {coords ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: -4, marginBottom: 8 }}>
          {c.jobsite.coordinates(formatCoordinates(coords))}
        </AppText>
      ) : null}

      {section(c.jobsite.contact)}
      <AppField label={c.form.contactName} value={form.contactName} onChangeText={(v) => set('contactName', v)} autoCapitalize="words" />
      <PhoneField label={c.form.contactPhone} value={form.contactPhone} onChange={(v) => set('contactPhone', v)} error={errors.contactPhone ? strings.common.phoneError : null} />
      <AppField
        label={c.form.contactEmail}
        value={form.contactEmail}
        onChangeText={(v) => set('contactEmail', v)}
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.contactEmail ? c.form.errorEmail : null}
      />

      {section(c.jobsite.emergency)}
      <AppField label={c.form.emergencyName} value={form.emergencyName} onChangeText={(v) => set('emergencyName', v)} autoCapitalize="words" />
      <PhoneField label={c.form.emergencyPhone} value={form.emergencyPhone} onChange={(v) => set('emergencyPhone', v)} error={errors.emergencyPhone ? strings.common.phoneError : null} />
      <AppField label={c.form.emergencyRelation} value={form.emergencyRelation} onChangeText={(v) => set('emergencyRelation', v)} />
      <AppField
        label={c.form.emergencyEmail}
        value={form.emergencyEmail}
        onChangeText={(v) => set('emergencyEmail', v)}
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.emergencyEmail ? c.form.errorEmail : null}
      />

      {section(c.jobsite.frequency)}
      <SelectField
        label={c.form.frequencyType}
        options={[
          { value: 'daily', label: c.form.daily },
          { value: 'weekly', label: c.form.weekly },
          { value: 'other', label: c.form.other },
        ]}
        value={f.kind}
        onChange={(kind) =>
          set('frequency', kind === 'daily' ? { kind, days: [0, 1, 2, 3, 4, 5, 6] } : kind === 'weekly' ? { kind, days: f.kind === 'weekly' ? f.days : [] } : { kind, days: [], other: f.other ?? '' })
        }
      />
      {f.kind === 'other' ? (
        <>
          <AppField label={c.form.describe} value={f.other ?? ''} onChangeText={(v) => set('frequency', { ...f, other: v })} />
          <AppField
            label={c.form.visitsPerMonth}
            value={form.visitsPerMonth}
            onChangeText={(v) => set('visitsPerMonth', v)}
            keyboardType="numeric"
            error={errors.visitsPerMonth ? c.form.errorVisits : null}
          />
        </>
      ) : (
        <View style={{ marginBottom: 8 }}>
          <DayButtons
            labels={c.form.days}
            selected={f.days}
            disabled={f.kind === 'daily'}
            onToggle={(d) =>
              set('frequency', { ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b) })
            }
          />
        </View>
      )}
      <AppField
        label={c.jobsite.estHours}
        value={form.estHours}
        onChangeText={(v) => set('estHours', v)}
        keyboardType="numeric"
        error={errors.estHours ? c.form.errorHours : null}
      />
      {/* D-216: la fecha se elige en el calendario; el inicio de un cliente previo puede ser pasado. */}
      <UsDateField
        label={c.jobsite.startDate}
        value={form.startDate}
        onChange={(v) => set('startDate', v)}
        optional
        allowPast
        error={errors.startDate ? c.form.errorDate : null}
      />
      {withRate ? (
        <AppField
          label={c.form.rate}
          value={form.rate}
          onChangeText={(v) => set('rate', v)}
          keyboardType="decimal-pad"
          placeholder="$0.00"
          error={errors.rate ? c.form.errorRate : null}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 10, marginBottom: 4 },
});
