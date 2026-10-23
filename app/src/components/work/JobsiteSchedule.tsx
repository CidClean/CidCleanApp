import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { CardBlock } from '../bento/Card';
import { ListRow } from '../ListRow';
import type { Clock } from '../PickerField';
import { ClockField } from './ClockField';
import { HoursField } from './HoursField';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import type { Jobsite } from '@/lib/clientRules';
import { saveLocation } from '@/lib/jobsiteLocation';
import { dateFromKey, formatShortDate } from '@/lib/leadRules';
import { fetchJobsiteSchedule, setJobsiteVisitTime, type JobsiteSchedule as Data } from '@/lib/scheduleApi';
import { formatMinutes } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { canAny } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { sample, useTheme } from '@/theme';

/**
 * Pestaña Horario del jobsite (D-055, D-232): hora y duración de las visitas (se usan al armar cada semana)
 * y la lista de las próximas visitas con su personal.
 */
export function JobsiteSchedule({ jobsite }: { jobsite: Jobsite }) {
  const { colors } = useTheme();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const [data, setData] = useState<Data | null>(null);
  const [time, setTime] = useState<Clock | null>(null);
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSet = canAny(access, ['schedule_ver_editar', 'clientes_editar_datos']) && jobsite.status !== 'terminated';

  const load = useCallback(async () => {
    // Jobsites guardados antes del hito 6: su ubicación sale del Plus Code al abrir el Horario (D-200).
    if (canAny(access, ['clientes_editar_datos']) && jobsite.plusCode) await saveLocation(jobsite.id, jobsite.plusCode);
    const r = await fetchJobsiteSchedule(jobsite.id);
    if (!r.ok) {
      setError(t.errorLoad);
      return;
    }
    setData(r.data);
    if (r.data.startTime) {
      const [h, m] = r.data.startTime.split(':').map(Number);
      setTime({ hours: h, minutes: m });
    }
    setMinutes(r.data.minutes ? String(r.data.minutes) : '');
  }, [access, jobsite.id, jobsite.plusCode, t.errorLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save() {
    const mins = Number(minutes);
    if (!time || !(mins >= 15 && mins <= 1440)) {
      setError(t.errorDuration);
      return;
    }
    setBusy(true);
    const r = await setJobsiteVisitTime(jobsite.id, `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`, mins);
    setBusy(false);
    if (!r.ok) {
      setError(t.errorSave);
      return;
    }
    setError(null);
    await load();
  }

  return (
    <View>
      {error ? <AppAlert tone="error" text={error} /> : null}
      {canSet ? (
        <>
          <ClockField label={t.jobsiteTime} value={time} onChange={setTime} />
          <HoursField label={t.jobsiteDuration} value={minutes} onChange={setMinutes} />
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
            {jobsite.frequency?.kind === 'other' ? t.jobsiteOther : t.jobsiteTimeNote}
          </AppText>
          <AppButton label={t.save} onPress={() => void save()} disabled={busy} />
          <View style={{ height: 12 }} />
        </>
      ) : null}
      {data && !data.startTime ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
          {t.jobsiteNoTime}
        </AppText>
      ) : null}
      {data && data.visits.length > 0 ? (
        <CardBlock>
          {data.visits.map((v, i) => (
            <ListRow
              key={v.id}
              title={`${formatShortDate(dateFromKey(v.day), s)} · ${formatTime(v.startsAt)}`}
              detail={`${formatMinutes(v.minutes, t.hours)} · ${v.staff.length ? v.staff.join(', ') : t.noStaff}`}
              last={i === data.visits.length - 1}
            />
          ))}
        </CardBlock>
      ) : data ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {t.noVisits}
        </AppText>
      ) : null}
    </View>
  );
}
