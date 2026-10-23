import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card, CardBlock } from '@/components/bento/Card';
import { Chip } from '@/components/Chip';
import { FormScroll } from '@/components/FormScroll';
import { Icon } from '@/components/Icon';
import type { Clock } from '@/components/PickerField';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { ClockField, clockOf } from '@/components/work/ClockField';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, formatShortDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { approveVisit, editWorkEntry, fetchVisitWork, recordWork, reviewGps, type VisitWork, type WorkEntry } from '@/lib/scheduleApi';
import { atTime, formatMinutes, workedMinutes } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { can, canAny } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

type Editing = { kind: 'edit'; entry: WorkEntry } | { kind: 'record'; profileId: string } | null;

/**
 * Detalle de un trabajo (D-109): encabezado con sitio y día, resumen (personas y horas en total), una fila por persona
 * con su horario, horas y fichas (GPS fuera de rango D-054, sin ubicación, sin conexión, no programado, registrado por
 * otro), un lápiz por fila que abre sus horas, el registro por otros (D-052) y, fija abajo, Aprobar.
 */
export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const [work, setWork] = useState<VisitWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [inTime, setInTime] = useState<Clock | null>(null);
  const [outTime, setOutTime] = useState<Clock | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchVisitWork(id);
    if (r.ok) setWork(r.data);
    else setError(t.errorLoad);
  }, [id, t.errorLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!canAny(access, ['work_aprobar', 'work_editar', 'work_revisar_gps', 'work_registrar_por_otros'])) return <Redirect href="/" />;
  const canEdit = can(access, 'work_editar');
  const canRecord = can(access, 'work_registrar_por_otros');

  function openEdit(entry: WorkEntry) {
    setEditing({ kind: 'edit', entry });
    setInTime(clockOf(entry.clockIn));
    setOutTime(entry.clockOut ? clockOf(entry.clockOut) : null);
  }

  function openRecord(profileId: string) {
    if (!work) return;
    setEditing({ kind: 'record', profileId });
    setInTime(clockOf(work.startsAt));
    setOutTime(clockOf(new Date(work.startsAt.getTime() + work.minutes * 60000)));
  }

  async function saveHours() {
    if (!work || !editing || !inTime) return;
    const cin = atTime(work.day, inTime.hours, inTime.minutes);
    const cout = outTime ? atTime(work.day, outTime.hours, outTime.minutes) : null;
    if (cout && cout <= cin) {
      setError(t.errorHours);
      return;
    }
    setBusy(true);
    const r =
      editing.kind === 'edit'
        ? await editWorkEntry(editing.entry.id, cin, cout)
        : await recordWork(work.id, [{ profileId: editing.profileId, clockIn: cin, clockOut: cout }]);
    setBusy(false);
    setEditing(null);
    if (!r.ok) setError(t.errorSave);
    else setError(null);
    await load();
  }

  async function approve() {
    if (!work || busy) return;
    setBusy(true);
    const r = await approveVisit(work.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.reason === 'open_shift' ? t.errorOpen : r.reason === 'gps_pending' ? t.errorGps : t.errorSave);
      return;
    }
    goBack();
  }

  const total = (work?.entries ?? []).reduce((n, e) => n + (e.clockOut ? workedMinutes(e.clockIn, e.clockOut) : 0), 0);
  const missing = (work?.scheduled ?? []).filter((p) => !work?.entries.some((e) => e.profileId === p.id));
  const name = (pid: string) => work?.scheduled.find((p) => p.id === pid)?.name ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.workTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {error ? <AppAlert tone="error" text={error} /> : null}
        {work ? (
          <>
            <Card tone="brand" wide style={{ gap: 4, marginBottom: 12, padding: 18 }}>
              <AppText weight="heavy" size={22} color="#FFFFFF">
                {work.jobsite}
              </AppText>
              <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                {`${formatShortDate(dateFromKey(work.day), s)} · ${formatTime(work.startsAt)}`}
              </AppText>
              <AppText weight="bold" color="#FFFFFF" style={{ marginTop: 4 }}>
                {t.summary(t.people(work.entries.length), formatMinutes(total, t.hours))}
              </AppText>
            </Card>
            <CardBlock>
              {work.entries.map((e, i) => (
                <View key={e.id} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === work.entries.length - 1 ? 0 : 0.5 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold">{e.name}</AppText>
                    <AppText size={13} color={colors.secondary}>
                      {`${t.entryLine(formatTime(e.clockIn), e.clockOut ? formatTime(e.clockOut) : t.stillIn)}${e.clockOut ? ` · ${formatMinutes(workedMinutes(e.clockIn, e.clockOut), t.hours)}` : ''}`}
                    </AppText>
                    <View style={styles.chips}>
                      {e.gpsPending ? <Chip label={t.gpsOut} tone="warning" /> : null}
                      {e.gpsReviewed ? <Chip label={t.gpsReviewed} tone="success" /> : null}
                      {e.inStatus === 'no_location' || e.outStatus === 'no_location' ? <Chip label={t.noLocation} tone="warning" /> : null}
                      {e.offline ? <Chip label={t.offline} tone="warning" /> : null}
                      {e.unscheduled ? <Chip label={t.unscheduled} tone="warning" /> : null}
                      {e.manual ? <Chip label={t.manual} tone="neutral" /> : null}
                      {!e.clockOut ? <Chip label={t.open} tone="warning" /> : null}
                    </View>
                    {e.gpsPending && e.distanceM !== null ? (
                      <AppText size={12} color={colors.attentionText}>
                        {t.distance(e.distanceM)}
                      </AppText>
                    ) : null}
                    {e.gpsPending && can(access, 'work_revisar_gps') && !work.approved ? (
                      <View style={{ marginTop: 6 }}>
                        <AppButton label={t.reviewGps} variant="outline" onPress={() => void reviewGps(e.id).then(load)} />
                      </View>
                    ) : null}
                  </View>
                  {canEdit && !work.approved ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t.editHours(e.name)} onPress={() => openEdit(e)} hitSlop={8}>
                      <Icon name="pencil" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {work.entries.length === 0 ? (
                <AppText size={sample.noteSize} color={colors.secondary} style={{ paddingVertical: 12 }}>
                  {t.noVisits}
                </AppText>
              ) : null}
            </CardBlock>
            {/* D-052: registrar a quien no marcó (parte de lo programado). */}
            {canRecord && !work.approved && missing.length > 0 ? (
              <SelectField
                label={t.registerOthers}
                options={missing.map((p) => ({ value: p.id, label: p.name }))}
                value={'' as string}
                onChange={(pid) => openRecord(pid)}
                renderTrigger={(_label, open) => <AppButton label={t.addPerson} variant="outline" icon="plus" onPress={open} />}
              />
            ) : null}
          </>
        ) : null}
      </FormScroll>
      {work && !work.approved && can(access, 'work_aprobar') ? (
        <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 10 + insets.bottom }]}>
          <AppButton label={t.approve} onPress={() => void approve()} disabled={busy || work.entries.length === 0} />
        </View>
      ) : null}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {editing?.kind === 'edit' ? t.editHours(editing.entry.name) : editing ? t.editHours(name(editing.profileId)) : ''}
        </AppText>
        <ClockField label={t.clockInLabel} value={inTime} onChange={setInTime} />
        <ClockField label={t.clockOutLabel} value={outTime} onChange={setOutTime} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setEditing(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={t.save} onPress={() => void saveHours()} disabled={busy} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  bar: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 0.5 },
});
