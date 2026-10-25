import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { FormScroll } from '@/components/FormScroll';
import type { Clock } from '@/components/PickerField';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { UsDateField } from '@/components/UsDateField';
import { HoursField } from '@/components/work/HoursField';
import { ClockField } from '@/components/work/ClockField';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { fetchJobsites } from '@/lib/clientsApi';
import { dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { addVisit } from '@/lib/scheduleApi';
import { atTime } from '@/lib/scheduleRules';
import { startDateError } from '@/lib/clientRules';
import { usePermissions } from '@/lib/session';
import { can } from '@/lib/visibility';
import { useTheme } from '@/theme';

/** Visita a mano (D-214: la frecuencia "Otra" se programa a mano; también un día extra). Al crearla se abre. */
export default function NewVisitScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const [jobsites, setJobsites] = useState<{ id: string; name: string; legacy: boolean }[]>([]);
  const [jobsite, setJobsite] = useState('');
  const [date, setDate] = useState(formatUsDate(dayKey(new Date())));
  const [time, setTime] = useState<Clock | null>(null);
  // D-200: una visita a mano parte en 2 horas.
  const [minutes, setMinutes] = useState('120');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchJobsites().then((r) => {
      if (!r.ok) return;
      const active = r.data.filter((j) => j.status === 'active').map((j) => ({ id: j.id, name: `${j.clientName} · ${j.name}`, legacy: j.clientLegacy }));
      setJobsites(active);
      setJobsite((cur) => cur || (active[0]?.id ?? ''));
    });
  }, []);

  if (!can(access, 'schedule_ver_editar')) return <Redirect href="/" />;
  // D-241: en jobsites de clientes previos la visita puede ser de un día pasado.
  // D-244: el Super Admin puede poner un día pasado en cualquier jobsite.
  const legacy = access.isSuperAdmin || (jobsites.find((j) => j.id === jobsite)?.legacy ?? false);

  async function create() {
    const key = parseUsDate(date);
    const mins = Number(minutes);
    if (!jobsite || !key || key === 'invalid' || startDateError(key, new Date(), legacy) || !time || !(mins >= 15 && mins <= 1440)) {
      setError(t.errorDuration);
      return;
    }
    setBusy(true);
    const r = await addVisit(jobsite, atTime(key, time.hours, time.minutes), mins);
    setBusy(false);
    if (!r.ok) {
      setError(t.errorSave);
      return;
    }
    router.replace({ pathname: '/schedule/visit/[id]', params: { id: r.data, day: key } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.newVisit} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {error ? <AppAlert tone="error" text={error} /> : null}
        {jobsites.length > 0 ? (
          <SelectField label={t.jobsite} options={jobsites.map((j) => ({ value: j.id, label: j.name }))} value={jobsite} onChange={setJobsite} />
        ) : null}
        <UsDateField label={t.day} value={date} onChange={setDate} allowPast={legacy} />
        <ClockField label={t.time} value={time} onChange={setTime} />
        <HoursField label={t.duration} value={minutes} onChange={setMinutes} />
        <AppButton label={t.save} onPress={() => void create()} disabled={busy || !jobsite} />
      </FormScroll>
    </View>
  );
}
