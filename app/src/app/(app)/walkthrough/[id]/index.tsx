import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { PendingBody } from '@/components/PendingScreen';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { DayButtons } from '@/components/walkthrough/DayButtons';
import { StepHeader } from '@/components/walkthrough/StepHeader';
import { SyncStatus } from '@/components/walkthrough/SyncStatus';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import type { WalkthroughStrings } from '@/i18n/walkthrough';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useWalkthrough } from '@/lib/useWalkthrough';
import {
  STEPS,
  STEP_COUNT,
  areaDetail,
  canDoWalkthroughs,
  clampStep,
  stepProgress,
  syncBadge,
  timesPerWeek,
  toggleDay,
  withFrequencyKind,
  type Frequency,
  type WalkthroughData,
} from '@/lib/walkthroughRules';
import { sample, useTheme } from '@/theme';

/**
 * Walkthrough por pasos (D-073): "Paso N de 5 · nombre", barra de 4px, contenido del paso y Atrás / Siguiente.
 * Todo se guarda en el teléfono al momento (D-004) y la cola lo manda cuando hay señal; el aviso va bajo el título
 * (D-091, D-119). El paso Resumen queda pendiente de decidir (no tiene muestra aprobada).
 */
export default function WalkthroughScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const { doc, missing, update, updateLocal } = useWalkthrough(id);

  // Los campos escriben en una copia local (sin saltos del cursor) y se guardan en el teléfono al momento.
  const [form, setForm] = useState<Pick<WalkthroughData, 'contact' | 'frequency' | 'internal'> | null>(null);
  useEffect(() => {
    if (doc && !form) setForm({ contact: doc.data.contact, frequency: doc.data.frequency, internal: doc.data.internal });
  }, [doc, form]);

  if (!canDoWalkthroughs(access)) return <Redirect href="/" />;

  function setSection<K extends 'contact' | 'frequency' | 'internal'>(key: K, value: WalkthroughData[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    void update((d) => ({ ...d, data: { ...d.data, [key]: value } }));
  }

  const step = doc ? clampStep(doc.step) : 1;
  const stepKey = STEPS[step - 1];
  const goTo = (n: number) => void updateLocal((d) => ({ ...d, step: clampStep(n) }));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar
        title={w.title}
        onBack={goBack}
        backLabel={strings.common.back}
        subtitle={doc ? <SyncStatus badge={syncBadge(doc)} pendingLabel={w.pending} syncedLabel={w.synced} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {missing ? <AppAlert tone="error" text={w.missing} /> : null}
        {doc && form ? (
          <>
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 2 }}>
              {`${doc.company} · ${doc.siteLabel}`}
            </AppText>
            <StepHeader label={w.stepLine(step, w.steps[stepKey])} progress={stepProgress(step)} />

            {stepKey === 'site' ? (
              <>
                <AppField label={w.site.address} value={form.contact.address} onChangeText={(v) => setSection('contact', { ...form.contact, address: v })} />
                <AppField
                  label={w.site.contact}
                  value={form.contact.contactName}
                  autoCapitalize="words"
                  onChangeText={(v) => setSection('contact', { ...form.contact, contactName: v })}
                />
                <AppField
                  label={w.site.phone}
                  value={form.contact.phone}
                  keyboardType="phone-pad"
                  onChangeText={(v) => setSection('contact', { ...form.contact, phone: v })}
                />
                <AppField
                  label={w.site.email}
                  value={form.contact.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onChangeText={(v) => setSection('contact', { ...form.contact, email: v })}
                />
                <AppField
                  label={w.site.general}
                  value={form.contact.general}
                  multiline
                  textAlignVertical="top"
                  style={{ minHeight: 96 }}
                  onChangeText={(v) => setSection('contact', { ...form.contact, general: v })}
                />
              </>
            ) : null}

            {stepKey === 'areas' ? (
              <>
                {doc.data.areas.length === 0 ? (
                  <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
                    {w.areas.empty}
                  </AppText>
                ) : null}
                {doc.data.areas.map((a, i) => {
                  const detail = areaDetail(a, (c) => w.conditions[c]);
                  return (
                    <ListRow
                      key={a.id}
                      title={a.name}
                      detail={detail === '' ? undefined : detail}
                      chevron
                      last={i === doc.data.areas.length - 1}
                      onPress={() => router.push({ pathname: '/walkthrough/[id]/area', params: { id, area: a.id } })}
                    />
                  );
                })}
                <View style={{ marginTop: 10 }}>
                  <AppButton
                    label={w.areas.add}
                    variant="outline"
                    icon="plus"
                    onPress={() => router.push({ pathname: '/walkthrough/[id]/area', params: { id } })}
                  />
                </View>
              </>
            ) : null}

            {stepKey === 'frequency' ? (
              <FrequencyStep w={w} value={form.frequency} onChange={(f) => setSection('frequency', f)} />
            ) : null}

            {stepKey === 'internal' ? (
              <>
                <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                  {w.internal.note}
                </AppText>
                <AppField label={w.internal.staff} value={form.internal.staff} onChangeText={(v) => setSection('internal', { ...form.internal, staff: v })} />
                <AppField label={w.internal.time} value={form.internal.time} onChangeText={(v) => setSection('internal', { ...form.internal, time: v })} />
                <AppField
                  label={w.internal.supplies}
                  value={form.internal.supplies}
                  multiline
                  textAlignVertical="top"
                  style={{ minHeight: 72 }}
                  onChangeText={(v) => setSection('internal', { ...form.internal, supplies: v })}
                />
              </>
            ) : null}

            {/* TEMPORAL: el Resumen (revisar, corregir y cerrar, con el PDF) espera su diseño; ver el reporte del hito 3. */}
            {stepKey === 'summary' ? (
              <View style={{ height: 120 }}>
                <PendingBody />
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton label={w.back} variant="outline" disabled={step === 1} onPress={() => goTo(step - 1)} />
              </View>
              <View style={styles.flex}>
                <AppButton label={w.next} disabled={step === STEP_COUNT} onPress={() => goTo(step + 1)} />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Paso Frecuencia (D-075, D-080, D-105): campo Tipo y debajo los días y "N veces por semana", o el texto libre de Otra. */
function FrequencyStep({ w, value, onChange }: { w: WalkthroughStrings; value: Frequency; onChange: (f: Frequency) => void }) {
  const { colors } = useTheme();
  const times = timesPerWeek(value);
  return (
    <>
      <SelectField
        label={w.frequency.type}
        options={[
          { value: 'daily', label: w.frequency.daily },
          { value: 'weekly', label: w.frequency.weekly },
          { value: 'other', label: w.frequency.other },
        ]}
        value={value.kind}
        onChange={(k) => onChange(withFrequencyKind(value, k))}
      />
      {value.kind === 'other' ? (
        <AppField label={w.frequency.describe} value={value.other} onChangeText={(v) => onChange({ ...value, other: v })} />
      ) : (
        <>
          <DayButtons
            labels={w.frequency.days}
            selected={value.days}
            disabled={value.kind === 'daily'}
            onToggle={(d) => onChange(toggleDay(value, d))}
          />
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 8 }}>
            {times ? w.frequency.times(times) : w.frequency.noDays}
          </AppText>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
