import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { TimeField, type Clock } from '@/components/PickerField';
import { MonthCalendar } from '@/components/sales/MonthCalendar';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  canEditLeads,
  canGoToPreviousMonth,
  checkSchedule,
  dateFromKey,
  dayKey,
  formatClock,
  monthGrid,
  shiftMonth,
  siteLabel,
  type Lead,
} from '@/lib/leadRules';
import { fetchAppointmentDays, fetchLead, scheduleWalkthrough } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Agendar walkthrough (D-072, D-078, D-104).
 * Paso 1 (muestra ronda 9): campo desplegable Sitio, "Después, el calendario y la hora" y Continuar.
 * Paso 2 (muestra ronda 12): mes con flechas, puntos en los días con citas, día elegido de marca, campo Hora y Agendar.
 * Si se entra tocando un sitio, ya va elegido y abre en el paso 2 (D-200). Al agendar vuelve al lead (D-200).
 */
export default function ScheduleWalkthroughScreen() {
  const params = useLocalSearchParams<{ id: string; site?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const today = useMemo(() => new Date(), []);

  const [lead, setLead] = useState<Lead | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [siteId, setSiteId] = useState<string>(params.site ?? '');
  const [step, setStep] = useState<'site' | 'calendar'>(params.site ? 'calendar' : 'site');
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string>(dayKey(today));
  const [time, setTime] = useState<Clock | null>(null);
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set());
  const [error, setError] = useState<'time' | 'past' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLead(params.id).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadFailed(true);
        return;
      }
      setLead(result.data);
      setSiteId((prev) => prev || (result.data.sites[0]?.id ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Si el sitio ya tiene cita agendada, parte con su día y su hora (agendar otra vez la mueve).
  const site = lead?.sites.find((x) => x.id === siteId) ?? null;
  useEffect(() => {
    const current = site?.scheduled?.startsAt;
    if (!current || current.getTime() < today.getTime()) return;
    setSelected(dayKey(current));
    setView({ year: current.getFullYear(), month: current.getMonth() });
    setTime({ hours: current.getHours(), minutes: current.getMinutes() });
  }, [site, today]);

  // Puntos del mes visible (D-104): todas las citas agendadas que la persona puede ver.
  useEffect(() => {
    let cancelled = false;
    const from = new Date(view.year, view.month, 1);
    const to = new Date(view.year, view.month + 1, 1);
    void fetchAppointmentDays(from, to).then((result) => {
      if (!cancelled && result.ok) setBusyDays(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving || !siteId) return;
    const check = checkSchedule(selected, time ? formatClock(time.hours, time.minutes) : '', new Date());
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setSaving(true);
    const result = await scheduleWalkthrough(siteId, check.startsAt);
    setSaving(false);
    if (!result.ok) {
      setError(result.reason === 'invalid' ? 'past' : 'save');
      return;
    }
    goBack();
  }

  const weeks = monthGrid(view.year, view.month, today, busyDays, selected);
  const previousAllowed = canGoToPreviousMonth(view.year, view.month, today);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={s.schedule.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed ? <AppAlert tone="error" text={s.detail.errorLoad} /> : null}
        {lead && lead.sites.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.sites.needSite}
          </AppText>
        ) : null}

        {lead && lead.sites.length > 0 && step === 'site' ? (
          <>
            <SelectField
              label={s.schedule.site}
              options={lead.sites.map((x) => ({ value: x.id, label: siteLabel(x) }))}
              value={siteId}
              onChange={setSiteId}
            />
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
              {s.schedule.afterSite}
            </AppText>
            <AppButton label={s.schedule.continue} onPress={() => setStep('calendar')} disabled={!siteId} />
          </>
        ) : null}

        {lead && site && step === 'calendar' ? (
          <>
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 6 }}>
              {siteLabel(site)}
            </AppText>
            <MonthCalendar
              title={`${s.schedule.months[view.month]} ${view.year}`}
              weekDays={s.schedule.weekDays}
              weeks={weeks}
              onSelect={(key) => {
                setSelected(key);
                setError(null);
              }}
              onPrevious={previousAllowed ? () => setView((v) => shiftMonth(v.year, v.month, -1)) : undefined}
              onNext={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              previousLabel={s.schedule.previousMonth}
              nextLabel={s.schedule.nextMonth}
            />
            {/* D-216: la hora se elige en una hoja (hora, minutos de 5 en 5 y AM / PM), no se escribe. */}
            <TimeField
              label={s.schedule.time}
              value={time}
              onChange={(v) => {
                setTime(v);
                setError(null);
              }}
              format={(v) => formatClock(v.hours, v.minutes)}
              placeholder={strings.common.pickTime}
              strings={{ hour: strings.common.hour, minutes: strings.common.minutes, done: strings.common.done }}
              error={error === 'time' ? s.schedule.errorTime : error === 'past' ? s.schedule.errorPast : null}
            />
            {error === 'save' ? <AppAlert tone="error" text={s.schedule.errorSchedule} /> : null}
            <View style={{ height: 2 }} />
            <AppButton
              label={s.schedule.submit}
              onPress={() => void submit()}
              disabled={saving || dateFromKey(selected).getTime() < dateFromKey(dayKey(today)).getTime()}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
