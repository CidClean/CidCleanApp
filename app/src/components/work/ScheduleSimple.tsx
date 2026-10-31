import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { DialogButtons, Initial, MissingChip, PersonChip, RangePills } from './SimpleParts';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, dayKey, formatShortDate } from '@/lib/leadRules';
import { fetchSchedule, fetchSchedulable, setVisitStaff, type Schedulable, type ScheduleVisit } from '@/lib/scheduleApi';
import { addDays, formatMinutes, sundayOf } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { can } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { iconStrokeWidth, useTheme } from '@/theme';

export type SimpleRange = 'today' | 'three' | 'week';

/** Días del modo Simple (D-232): Hoy, 3 días con hoy al centro, o la semana de domingo a sábado (D-231). */
export function simpleDays(range: SimpleRange, today: Date): string[] {
  if (range === 'today') return [dayKey(today)];
  if (range === 'three') return [-1, 0, 1].map((i) => dayKey(addDays(today, i)));
  const sun = sundayOf(today);
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(sun, i)));
}

/**
 * Schedule simple (D-232, `surveys/schedule-simple-aprobado.html`): por día, cada jobsite con hora · duración en horas
 * y las personas en fichas; hoy en tarjeta de marca; "Falta asignar personal" en ámbar. Tocar una tarjeta abre una
 * ventana al centro con casillas para cambiar quién va ese día (solo esa visita). Si la visita es de hoy o de un día
 * pasado y la persona tiene `work_registrar_por_otros`, la ventana lleva "Registrar trabajo" (D-254).
 */
export function ScheduleSimple({ onError, jobsiteId }: { onError: (text: string | null) => void; jobsiteId?: string }) {
  const { colors, brand } = useTheme();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const router = useRouter();
  const { access } = usePermissions();
  const [range, setRange] = useState<SimpleRange>('three');
  const [visits, setVisits] = useState<ScheduleVisit[] | null>(null);
  const [editing, setEditing] = useState<ScheduleVisit | null>(null);
  const [people, setPeople] = useState<Schedulable[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayKey(new Date());
  const days = simpleDays(range, new Date());

  const load = useCallback(async () => {
    const r = await fetchSchedule(days[0], days[days.length - 1]);
    if (r.ok) {
      // Dentro de un jobsite solo se ven sus visitas (D-235).
      setVisits(jobsiteId ? r.data.filter((v) => v.jobsiteId === jobsiteId) : r.data);
      onError(null);
    } else onError(t.errorLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], days[days.length - 1], jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function open(v: ScheduleVisit) {
    setEditing(v);
    setDialogError(null);
    setChosen(new Set(v.staff.map((p) => p.id)));
    setPeople(v.staff.map((p) => ({ id: p.id, name: p.name, assigned: true, weekMinutes: 0 })));
    const r = await fetchSchedulable(v.id);
    if (r.ok) setPeople(r.data);
  }

  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    const r = await setVisitStaff(editing.id, [...chosen]);
    setBusy(false);
    if (!r.ok) {
      setDialogError(r.reason === 'over_32' ? t.over32(r.detail ?? '') : r.reason === 'ica_required' ? t.errorIca(r.detail ?? '') : t.errorSave);
      return;
    }
    setWarn(r.data.length ? t.warn28(r.data.map((w) => w.name).join(', ')) : null);
    setEditing(null);
    await load();
  }

  const dayLabel = (key: string) => formatShortDate(dateFromKey(key), s);
  return (
    <View style={{ gap: 12 }}>
      <RangePills
        options={[
          { value: 'today', label: t.rangeToday },
          { value: 'three', label: t.range3 },
          { value: 'week', label: t.rangeWeek },
        ]}
        value={range}
        onChange={setRange}
      />
      {warn ? <AppAlert text={warn} /> : null}
      <View style={{ gap: 16 }}>
        {days.map((d) => {
          const list = (visits ?? []).filter((v) => v.day === d).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
          const isToday = d === today;
          return (
            <View key={d} style={{ gap: 8 }}>
              <View style={styles.dayh}>
                <AppText weight="heavy" size={16}>
                  {`${isToday ? t.todayPrefix : ''}${dayLabel(d)}`}
                </AppText>
                <AppText size={12} color={colors.secondary}>
                  {list.length ? t.jobsitesCount(list.length) : t.noVisitsDay}
                </AppText>
              </View>
              {list.map((v) => (
                <Pressable
                  key={v.id}
                  accessibilityRole="button"
                  accessibilityLabel={t.changeWho(v.jobsite)}
                  onPress={() => void open(v)}
                  style={[styles.site, { backgroundColor: isToday ? brand : colors.card }]}
                >
                  <View style={styles.siteh}>
                    <AppText weight="heavy" size={16} color={isToday ? '#FFFFFF' : colors.text} style={{ flexShrink: 1 }}>
                      {v.jobsite}
                    </AppText>
                    <AppText size={13} color={isToday ? '#FFFFFF' : colors.text} style={{ opacity: 0.85 }}>
                      {`${formatTime(v.startsAt)} · ${formatMinutes(v.minutes, t.hours)}`}
                    </AppText>
                  </View>
                  <View style={styles.people}>
                    {v.staff.length ? (
                      v.staff.map((p) => <PersonChip key={p.id} id={p.id} name={p.name} onBrand={isToday} />)
                    ) : (
                      <MissingChip label={t.missingStaff} onBrand={isToday} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
      </View>

      <Dialog visible={editing !== null} onClose={() => setEditing(null)}>
        {editing ? (
          <View style={{ gap: 12 }}>
            <AppText weight="heavy" size={18}>
              {editing.jobsite}
            </AppText>
            <AppText size={13} color={colors.secondary} style={{ marginTop: -6 }}>
              {`${dayLabel(editing.day)} · ${formatTime(editing.startsAt)} · ${formatMinutes(editing.minutes, t.hours)}`}
            </AppText>
            {dialogError ? <AppAlert tone="error" text={dialogError} /> : null}
            <View>
              {people.map((p) => {
                const on = chosen.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.name}
                    onPress={() =>
                      setChosen((cur) => {
                        const next = new Set(cur);
                        if (on) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    style={[styles.opt, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.box, on ? { backgroundColor: brand } : { borderWidth: 1, borderColor: colors.fieldBorder }]}>
                      {on ? <Icon name="check" size={13} strokeWidth={iconStrokeWidth} color="#FFFFFF" /> : null}
                    </View>
                    <Initial id={p.id} name={p.name} />
                    <AppText size={15}>{p.name}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <DialogButtons cancel={t.cancel} save={t.save} onCancel={() => setEditing(null)} onSave={() => void save()} disabled={busy} />
            {can(access, 'work_registrar_por_otros') && editing.day <= today ? (
              <AppButton
                label={t.registerOthers}
                variant="outline"
                onPress={() => {
                  const id = editing.id;
                  setEditing(null);
                  router.push({ pathname: '/schedule/work/[id]', params: { id } });
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  dayh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  site: { borderRadius: 22, padding: 14, gap: 10 },
  siteh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 0.5 },
  box: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
