import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { PhoneField } from '@/components/PhoneField';
import { formatPhone, isValidPhone } from '@/lib/phone';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { DayButtons } from '@/components/walkthrough/DayButtons';
import { StepHeader } from '@/components/walkthrough/StepHeader';
import { SyncStatus } from '@/components/walkthrough/SyncStatus';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import type { WalkthroughStrings } from '@/i18n/walkthrough';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { useWalkthrough } from '@/lib/useWalkthrough';
import {
  STEPS,
  STEP_COUNT,
  areaDetail,
  canDoWalkthroughs,
  clampStep,
  frequencySummary,
  isEditable,
  removeArea,
  stepProgress,
  syncBadge,
  timesPerWeek,
  toggleDay,
  withFrequencyKind,
  type Area,
  type Frequency,
  type StepKey,
  type WalkthroughData,
  type WalkthroughDoc,
} from '@/lib/walkthroughRules';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Walkthrough por pasos (D-073): "Paso N de 5 · nombre", barra de 4px, contenido del paso y Atrás / Siguiente.
 * Todo se guarda en el teléfono al momento (D-004) y la cola lo manda cuando hay señal; el aviso va bajo el título
 * (D-091, D-119). Resumen (D-212): lista por secciones con lápiz para volver a cada paso y "Cerrar walkthrough";
 * cerrado, se ve en solo lectura con "Ver PDF", y "Editar" en la barra abre una corrección que al cerrar es versión nueva.
 */
export default function WalkthroughScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const { locale } = useSession();
  const { doc, missing, update, updateLocal } = useWalkthrough(id);
  const [removing, setRemoving] = useState<Area | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);

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

  const editable = doc ? isEditable(doc) : false;
  // Cerrado (o con el cierre en la cola) se ve solo el Resumen.
  const step = doc ? (editable ? clampStep(doc.step) : 5) : 1;
  const stepKey = STEPS[step - 1];
  const goTo = (n: number) => void updateLocal((d) => ({ ...d, step: clampStep(n) }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={w.title}
        onBack={goBack}
        backLabel={strings.common.back}
        action={
          doc && doc.status === 'closed' && !doc.closeRequested
            ? {
                label: strings.common.edit,
                accessibilityLabel: strings.common.edit,
                // D-212: Editar en el Resumen cerrado abre una corrección (versión nueva al cerrar).
                onPress: () => void updateLocal((d) => ({ ...d, status: 'draft', step: 5 })),
              }
            : undefined
        }
        subtitle={doc ? <SyncStatus badge={syncBadge(doc)} pendingLabel={w.pending} syncedLabel={w.synced} /> : undefined}
      />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {missing ? <AppAlert tone="error" text={w.missing} /> : null}
        {doc && form ? (
          <>
            {/* D-226: empresa, sitio y paso en una tarjeta blanca de 24px. */}
            <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 2 }}>
              {`${doc.company} · ${doc.siteLabel}`}
            </AppText>
            <StepHeader label={w.stepLine(step, w.steps[stepKey])} progress={stepProgress(step)} />
            </View>

            {stepKey === 'site' ? (
              <>
                <AppField label={w.site.address} value={form.contact.address} onChangeText={(v) => setSection('contact', { ...form.contact, address: v })} />
                <AppField
                  label={w.site.contact}
                  value={form.contact.contactName}
                  autoCapitalize="words"
                  onChangeText={(v) => setSection('contact', { ...form.contact, contactName: v })}
                />
                {/* D-216: el error sale al dejar el campo; el walkthrough se guarda igual (es rápido, D-004). */}
                <PhoneField
                  label={w.site.phone}
                  value={form.contact.phone}
                  onChange={(v) => setSection('contact', { ...form.contact, phone: v })}
                  onBlur={() => setPhoneTouched(true)}
                  error={phoneTouched && !isValidPhone(form.contact.phone) ? strings.common.phoneError : null}
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
                  const detail = areaDetail(a, (c) => w.conditions[c], (z) => w.sizes[z]);
                  return (
                    <ListRow
                      key={a.id}
                      title={a.name}
                      detail={detail === '' ? undefined : detail}
                      right={
                        <Pressable accessibilityRole="button" accessibilityLabel={w.remove.areaLabel(a.name)} onPress={() => setRemoving(a)} hitSlop={8}>
                          <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                        </Pressable>
                      }
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

            {stepKey === 'summary' ? (
              <SummaryStep
                doc={doc}
                w={w}
                editable={editable}
                onEdit={goTo}
                onClose={() => void update((d) => ({ ...d, closeRequested: true }))}
                onPdf={() =>
                  router.push({
                    pathname: '/viewer',
                    params: {
                      source: 'walkthrough',
                      documentId: doc.id,
                      version: String(doc.version),
                      language: locale,
                      title: w.summary.pdfTitle(doc.company),
                    },
                  })
                }
              />
            ) : null}

            {editable ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton label={w.back} variant="outline" disabled={step === 1} onPress={() => goTo(step - 1)} />
              </View>
              <View style={styles.flex}>
                <AppButton label={w.next} disabled={step === STEP_COUNT} onPress={() => goTo(step + 1)} />
              </View>
            </View>
            ) : null}
          </>
        ) : null}
      </FormScroll>

      <Sheet visible={removing !== null} onClose={() => setRemoving(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {removing ? w.remove.areaTitle(removing.name) : ''}
        </AppText>
        {removing && removing.photos.length > 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
            {w.remove.areaBody}
          </AppText>
        ) : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setRemoving(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={w.remove.delete}
              onPress={() => {
                const target = removing;
                setRemoving(null);
                if (target) void update((d) => ({ ...d, data: { ...d.data, areas: removeArea(d.data.areas, target.id) } }));
              }}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

/** Paso Resumen (D-212): una sección por paso con su lápiz, y Cerrar walkthrough; cerrado, Ver PDF. */
function SummaryStep({
  doc,
  w,
  editable,
  onEdit,
  onClose,
  onPdf,
}: {
  doc: WalkthroughDoc;
  w: WalkthroughStrings;
  editable: boolean;
  onEdit: (step: number) => void;
  onClose: () => void;
  onPdf: () => void;
}) {
  const { colors } = useTheme();
  const c = doc.data.contact;
  const value = (v: string) => (v.trim() === '' ? w.summary.empty : v.trim());
  const section = (key: StepKey, index: number) => (
    <View style={styles.sectionHead}>
      <AppText size={sample.labelSize} color={colors.secondary}>
        {w.steps[key]}
      </AppText>
      {editable ? (
        <Pressable accessibilityRole="button" accessibilityLabel={w.summary.editSection(w.steps[key])} onPress={() => onEdit(index)} hitSlop={8}>
          <Icon name="pencil" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
  const rows = (items: [string, string][]) =>
    items.map(([label, v], i) => <ListRow key={label} title={label} detail={value(v)} last={i === items.length - 1} />);

  return (
    <View>
      {section('site', 1)}
      {rows([
        [w.site.address, c.address],
        [w.site.contact, c.contactName],
        [w.site.phone, formatPhone(c.phone)],
        [w.site.email, c.email],
        [w.site.general, c.general],
      ])}
      {section('areas', 2)}
      {doc.data.areas.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {w.summary.noAreas}
        </AppText>
      ) : (
        doc.data.areas.map((a, i) => {
          const detail = areaDetail(a, (k) => w.conditions[k], (z) => w.sizes[z]);
          return <ListRow key={a.id} title={a.name} detail={detail === '' ? undefined : detail} last={i === doc.data.areas.length - 1} />;
        })
      )}
      {section('frequency', 3)}
      <AppText>{frequencySummary(doc.data.frequency, w.frequency)}</AppText>
      {section('internal', 4)}
      {rows([
        [w.internal.staff, doc.data.internal.staff],
        [w.internal.time, doc.data.internal.time],
        [w.internal.supplies, doc.data.internal.supplies],
      ])}
      <View style={{ height: 12 }} />
      {doc.closeRequested ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {w.summary.closePending}
        </AppText>
      ) : doc.status === 'closed' ? (
        <>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
            {w.summary.closedLine(doc.version)}
          </AppText>
          <AppButton label={w.summary.viewPdf} variant="outline" icon="file-text" onPress={onPdf} />
        </>
      ) : (
        <>
          {doc.version > 0 ? (
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
              {w.summary.editingLine(doc.version)}
            </AppText>
          ) : null}
          <AppButton label={w.summary.close} onPress={onClose} />
        </>
      )}
    </View>
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
  // Encabezado de cada sección del Resumen: 12px gris (como los títulos de sección de las muestras) y lápiz de 18px.
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 2 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
