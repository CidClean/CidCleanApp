import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { UsDateField } from '@/components/UsDateField';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  canSetPay,
  emptyPayForm,
  hasPayErrors,
  parseHours,
  payExplanation,
  validatePay,
  type FixedPeriod,
  type PayErrors,
  type PayForm,
} from '@/lib/clientRules';
import { fetchLegacyJobsiteIds, fetchPay, setAssignmentPay } from '@/lib/clientsApi';
import { formatUsDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Pago de un empleado en un jobsite (D-059, D-061, D-096, D-100, D-210): el mismo formulario desde Pagos del empleado y
 * desde Personal del jobsite. Control Por hora / Tarifa fija; Por hora con Tarifa por hora y Horas garantizadas
 * (opcional); Tarifa fija con Cobra (Por visita, Por semana, Por mes), Monto y la línea de explicación; Desde (fecha de
 * inicio, sin efecto retroactivo) y Guardar. A un W-2 por hora no se le guarda menos de $15.00 (D-096).
 */
export default function PayScreen() {
  const params = useLocalSearchParams<{ assignment: string; jobsite?: string; jobsiteId?: string; site?: string; profile?: string; workerType?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const today = useMemo(() => new Date(), []);
  const [form, setForm] = useState<PayForm>(() => emptyPayForm(today, formatUsDate));
  const [errors, setErrors] = useState<PayErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const workerType = params.workerType === 'w2' || params.workerType === '1099' ? params.workerType : null;
  // D-241: en jobsites de clientes previos el pago puede empezar en una fecha pasada.
  const [legacy, setLegacy] = useState(false);
  const siteId = params.jobsiteId ?? params.site;
  useEffect(() => {
    if (!siteId) return;
    void fetchLegacyJobsiteIds().then((r) => r.ok && setLegacy(r.data.has(siteId)));
  }, [siteId]);

  // Parte con el pago vigente, si hay; la fecha nueva siempre parte en hoy.
  useEffect(() => {
    let cancelled = false;
    void fetchPay(params.jobsiteId ? { jobsite: params.jobsiteId } : { profile: params.profile }).then((r) => {
      if (cancelled || !r.ok) return;
      const p = r.data.get(params.assignment);
      if (!p) return;
      setForm((f) => ({
        ...f,
        kind: p.kind,
        hourlyRate: p.hourlyRate === null ? '' : String(p.hourlyRate),
        guaranteedHours: p.guaranteedHours === null ? '' : String(p.guaranteedHours),
        fixedPeriod: p.fixedPeriod ?? 'visit',
        fixedAmount: p.fixedAmount === null ? '' : String(p.fixedAmount),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [params.assignment, params.jobsiteId, params.profile]);

  if (!canSetPay(access)) return <Redirect href="/" />;

  const set = <K extends keyof PayForm>(k: K, v: PayForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (saving) return;
    const found = validatePay(form, workerType, today, legacy);
    setErrors(found);
    setFailed(false);
    if (hasPayErrors(found)) return;
    setSaving(true);
    const r = await setAssignmentPay(params.assignment, form);
    setSaving(false);
    if (!r.ok) {
      if (r.reason === 'minWage') setErrors({ hourlyRate: 'minWage' });
      else setFailed(true);
      return;
    }
    goBack();
  }

  const explanation = payExplanation(form, c.pay);
  const hours = parseHours(form.guaranteedHours);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={c.pay.title(params.jobsite ?? '')} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <Segmented
          options={[
            { value: 'hourly', label: c.pay.hourly },
            { value: 'fixed', label: c.pay.fixed },
          ]}
          value={form.kind}
          onChange={(k) => set('kind', k)}
        />
        {form.kind === 'hourly' ? (
          <>
            <AppField
              label={c.pay.hourlyRate}
              value={form.hourlyRate}
              onChangeText={(v) => set('hourlyRate', v)}
              keyboardType="decimal-pad"
              placeholder="$0.00"
              error={errors.hourlyRate === 'minWage' ? c.pay.minWage : errors.hourlyRate ? c.pay.errorRate : null}
            />
            <AppField
              label={c.pay.guaranteed}
              value={form.guaranteedHours}
              onChangeText={(v) => set('guaranteedHours', v)}
              keyboardType="decimal-pad"
              error={errors.guaranteedHours ? c.pay.errorHours : null}
            />
            {hours ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {c.pay.guaranteedLine(String(hours))}
              </AppText>
            ) : null}
          </>
        ) : (
          <>
            <SelectField<FixedPeriod>
              label={c.pay.period}
              options={(['visit', 'week', 'month'] as const).map((p) => ({ value: p, label: c.pay.periods[p] }))}
              value={form.fixedPeriod}
              onChange={(p) => set('fixedPeriod', p)}
            />
            <AppField
              label={c.pay.amount}
              value={form.fixedAmount}
              onChangeText={(v) => set('fixedAmount', v)}
              keyboardType="decimal-pad"
              placeholder="$0.00"
              error={errors.fixedAmount ? c.pay.errorAmount : null}
            />
            {explanation ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {explanation}
              </AppText>
            ) : null}
          </>
        )}
        <UsDateField
          label={c.pay.from}
          value={form.from}
          onChange={(v) => set('from', v)}
          allowPast={legacy}
          error={errors.from === 'past' ? c.pay.errorPast : errors.from ? c.pay.errorDate : null}
        />
        <View style={{ height: 4 }} />
        {failed ? <AppAlert tone="error" text={c.pay.errorSave} /> : null}
        <AppButton label={c.pay.save} onPress={() => void save()} disabled={saving} />
      </FormScroll>
    </View>
  );
}
