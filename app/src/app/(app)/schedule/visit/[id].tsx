import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { CardBlock } from '@/components/bento/Card';
import { Checkbox } from '@/components/Checkbox';
import { FormScroll } from '@/components/FormScroll';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { UsDateField } from '@/components/UsDateField';
import { HoursField } from '@/components/work/HoursField';
import { ClockField, clockOf } from '@/components/work/ClockField';
import type { Clock } from '@/components/PickerField';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import {
  deleteVisit,
  fetchSchedulable,
  fetchSchedule,
  setVisitStaff,
  updateVisit,
  type Schedulable,
  type ScheduleVisit,
  type StaffChip,
} from '@/lib/scheduleApi';
import { atTime, formatMinutes, weekWarning } from '@/lib/scheduleRules';
import { fetchLegacyJobsiteIds } from '@/lib/clientsApi';
import { usePermissions } from '@/lib/session';
import { can } from '@/lib/visibility';
import { sample, useTheme } from '@/theme';

/**
 * Una visita del schedule (D-214): día, hora y duración (se cambian por visita) y el personal programado con sus horas
 * de la semana (aviso desde 28 h; con más de 32 h no deja, D-214). Quitar la visita (D-011) y, con permiso, registrar
 * el trabajo por otros (D-052).
 */
export default function VisitScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const { access } = usePermissions();
  const [visit, setVisit] = useState<ScheduleVisit | null>(null);
  const [people, setPeople] = useState<Schedulable[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [date, setDate] = useState('');
  const [time, setTime] = useState<Clock | null>(null);
  const [minutes, setMinutes] = useState('');
  const [warn, setWarn] = useState<StaffChip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // D-241: en jobsites de clientes previos la visita se puede mover a un día pasado.
  const [legacyIds, setLegacyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void fetchLegacyJobsiteIds().then((r) => r.ok && setLegacyIds(r.data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const key = day ?? dayKey(new Date());
      const [v, p] = await Promise.all([fetchSchedule(key, key), fetchSchedulable(id)]);
      if (cancelled) return;
      const found = v.ok ? v.data.find((x) => x.id === id) : undefined;
      if (!found || !p.ok) {
        setError(t.errorLoad);
        return;
      }
      setVisit(found);
      setPeople(p.data);
      setChosen(new Set(found.staff.map((x) => x.id)));
      setDate(formatUsDate(found.day));
      setTime(clockOf(found.startsAt));
      setMinutes(String(found.minutes));
    })();
    return () => {
      cancelled = true;
    };
  }, [id, day, t.errorLoad]);

  if (!can(access, 'schedule_ver_editar')) return <Redirect href="/" />;

  const mins = Number(minutes);
  const validMinutes = Number.isInteger(mins) && mins >= 15 && mins <= 1440;
  const locked = visit ? visit.worked || visit.approved : true;

  async function save() {
    if (!visit || busy) return;
    const key = parseUsDate(date);
    if (!validMinutes || !key || key === 'invalid' || !time) {
      setError(t.errorDuration);
      return;
    }
    setBusy(true);
    setError(null);
    const startsAt = atTime(key, time.hours, time.minutes);
    if (!locked && (startsAt.getTime() !== visit.startsAt.getTime() || mins !== visit.minutes)) {
      const r = await updateVisit(visit.id, startsAt, mins);
      if (!r.ok) {
        setBusy(false);
        setError(r.reason === 'over_32' ? t.over32(r.detail ?? '') : r.reason === 'invalid' ? t.errorWorked : t.errorSave);
        return;
      }
    }
    const r = await setVisitStaff(visit.id, [...chosen]);
    setBusy(false);
    if (!r.ok) {
      setError(r.reason === 'over_32' ? t.over32(r.detail ?? '') : t.errorSave);
      return;
    }
    if (r.data.length) {
      setWarn(r.data);
      return;
    }
    goBack();
  }

  async function remove() {
    if (!visit) return;
    setConfirm(false);
    const r = await deleteVisit(visit.id);
    if (!r.ok) {
      setError(r.reason === 'invalid' ? t.errorWorked : t.errorSave);
      return;
    }
    goBack();
  }

  const minsFor = (p: Schedulable) => p.weekMinutes + (chosen.has(p.id) ? (validMinutes ? mins : visit?.minutes ?? 0) : 0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={visit?.jobsite ?? t.visitTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {error ? <AppAlert tone="error" text={error} /> : null}
        {warn.length ? <AppAlert text={t.warn28(warn.map((w) => w.name).join(', '))} /> : null}
        {visit ? (
          <>
            {!locked ? (
              <>
                <UsDateField label={t.day} value={date} onChange={setDate} allowPast={access.isSuperAdmin || (visit ? legacyIds.has(visit.jobsiteId) : false)} />
                <ClockField label={t.time} value={time} onChange={setTime} />
                <HoursField label={t.duration} value={minutes} onChange={setMinutes} />
              </>
            ) : (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {t.errorWorked}
              </AppText>
            )}
            <AppText size={sample.labelSize} color={colors.secondary} style={{ marginTop: 8, marginBottom: 4 }}>
              {t.staff}
            </AppText>
            <CardBlock>
              {people.map((p) => {
                const total = minsFor(p);
                const w = weekWarning(total);
                return (
                  <View key={p.id} style={{ paddingVertical: 8 }}>
                    <Checkbox
                      label={p.name}
                      checked={chosen.has(p.id)}
                      onChange={(on) =>
                        setChosen((cur) => {
                          const next = new Set(cur);
                          if (on) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        })
                      }
                    />
                    <AppText size={12} color={w ? colors.attentionText : colors.secondary} style={{ marginLeft: 28 }}>
                      {t.weekHours(formatMinutes(total, t.hours))}
                    </AppText>
                  </View>
                );
              })}
            </CardBlock>
            <AppButton label={t.save} onPress={() => void save()} disabled={busy} />
            <View style={{ gap: 8, marginTop: 12 }}>
              {can(access, 'work_registrar_por_otros') && visit.day <= dayKey(new Date()) ? (
                <AppButton label={t.registerOthers} variant="outline" onPress={() => router.push({ pathname: '/schedule/work/[id]', params: { id: visit.id } })} />
              ) : null}
              {!visit.worked ? <AppButton label={t.deleteVisit} variant="text" onPress={() => setConfirm(true)} /> : null}
            </View>
          </>
        ) : null}
      </FormScroll>
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {t.deleteTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
          {t.deleteBody}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setConfirm(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={t.confirmDelete} onPress={() => void remove()} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
