import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { SelectField } from '../SelectField';
import { Initial } from './SimpleParts';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, dayKey, formatShortDate } from '@/lib/leadRules';
import { fetchWeekPlan, saveWeek, type WeekPlan, type WeekSite } from '@/lib/scheduleApi';
import { addDays, formatMinutes, sundayOf } from '@/lib/scheduleRules';
import { copyWeek, sameCells, toggleCell } from '@/lib/scheduleViews';
import { formatTime } from '@/lib/week';
import { iconStrokeWidth, useTheme } from '@/theme';

// Letras de la cuadrícula tal como la muestra aprobada (D-232).
const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

type Person = { id: string; name: string };

/**
 * Modo Semana (D-232; reemplaza "Equipos fijos" de la muestra): el horario se arma semana por semana. Por jobsite, una
 * cuadrícula D L M M J V S × persona de la semana elegida (flechas para cambiar de semana); solo los días que el
 * jobsite trabaja se marcan. "Guardar semana" crea o cambia las visitas de esa semana con la regla de 32 h (aviso desde
 * 28 h y bloqueo). Una semana sin guardar se ve vacía; "Copiar semana anterior" la llena con la anterior (D-200).
 */
export function ScheduleWeek({ onError }: { onError: (text: string | null) => void }) {
  const { colors, brand } = useTheme();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const [sunday, setSunday] = useState(() => sundayOf(new Date()));
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[][]>>({});
  const [extra, setExtra] = useState<Record<string, Person[]>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = dayKey(sunday);

  const load = useCallback(async () => {
    const r = await fetchWeekPlan(key);
    if (!r.ok) {
      onError(t.errorLoad);
      return;
    }
    onError(null);
    setPlan(r.data);
    setDrafts({});
    setExtra({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cellsOf = (j: WeekSite) => drafts[j.id] ?? j.cells;
  const changed = (plan?.jobsites ?? []).filter((j) => drafts[j.id] && !sameCells(drafts[j.id], j.cells));
  const empty = plan !== null && plan.jobsites.every((j) => j.cells.every((c) => c.length === 0));

  function move(dir: 1 | -1) {
    setNotice(null);
    setSunday((d) => addDays(d, 7 * dir));
  }

  async function copyPrevious() {
    if (!plan) return;
    setNotice(null);
    const r = await fetchWeekPlan(dayKey(addDays(sunday, -7)));
    if (!r.ok) {
      setNotice({ tone: 'error', text: t.errorLoad });
      return;
    }
    const c = copyWeek(plan.jobsites, r.data.jobsites, drafts);
    setDrafts((cur) => ({ ...cur, ...c.cells }));
    setExtra((cur) => {
      const next = { ...cur };
      for (const [id, list] of Object.entries(c.people)) next[id] = [...(next[id] ?? []), ...list.filter((p) => !(next[id] ?? []).some((x) => x.id === p.id))];
      return next;
    });
  }

  async function save() {
    if (busy || changed.length === 0) return;
    setBusy(true);
    setNotice(null);
    const r = await saveWeek(key, changed.map((j) => ({ jobsite: j.id, cells: drafts[j.id] })));
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: 'error', text: r.reason === 'over_32' ? t.over32(r.detail ?? '') : t.errorSave });
      return;
    }
    await load();
    setNotice(r.data.length ? { tone: 'warning', text: t.warn28(r.data.map((w) => w.name).join(', ')) } : { tone: 'success', text: t.weekSaved });
  }

  const end = addDays(sunday, 6);
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.week, { backgroundColor: colors.card }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.previousWeek} onPress={() => move(-1)} hitSlop={12}>
          <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
        <AppText weight="bold">{`${formatShortDate(sunday, s)} – ${formatShortDate(end, s)}`}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t.followingWeek} onPress={() => move(1)} hitSlop={12}>
          <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </View>
      {notice ? <AppAlert tone={notice.tone === 'success' ? undefined : notice.tone} text={notice.text} /> : null}
      {empty && changed.length === 0 ? (
        <AppText size={13} color={colors.secondary}>
          {t.weekEmpty}
        </AppText>
      ) : null}
      {plan ? <AppButton label={t.copyPrevious} variant="outline" onPress={() => void copyPrevious()} /> : null}

      {(plan?.jobsites ?? []).map((j) => {
        const cells = cellsOf(j);
        const rows: Person[] = [...j.people, ...(extra[j.id] ?? []).filter((p) => !j.people.some((x) => x.id === p.id))];
        const others = (plan?.staff ?? []).filter((p) => !rows.some((r) => r.id === p.id));
        const time = j.startTime && j.minutes ? `${formatTime(clockDate(j.startTime))} · ${formatMinutes(j.minutes, t.hours)}` : null;
        return (
          <View key={j.id} style={[styles.grid, { backgroundColor: colors.card }]}>
            <AppText weight="heavy" size={16}>
              {j.name}
            </AppText>
            <AppText size={12} color={colors.secondary} style={{ marginTop: -8 }}>
              {time ? `${time} · ${t.weekHint}` : t.noTimeSite}
            </AppText>
            {time ? (
              <>
                {rows.length === 0 ? (
                  <AppText size={12} color={colors.secondary}>
                    {t.noPeopleSite}
                  </AppText>
                ) : (
                  <View style={{ gap: 4 }}>
                    <View style={styles.wk}>
                      <View style={styles.name} />
                      {DOW.map((d, i) => (
                        <AppText key={i} size={11} weight="bold" color={colors.secondary} center style={styles.col}>
                          {d}
                        </AppText>
                      ))}
                    </View>
                    {rows.map((p) => (
                      <View key={p.id} style={styles.wk}>
                        <View style={[styles.name, styles.nameRow]}>
                          <Initial id={p.id} name={p.name} />
                          <AppText size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {p.name}
                          </AppText>
                        </View>
                        {DOW.map((_, i) => {
                          const works = j.days.includes(i);
                          const on = cells[i]?.includes(p.id) ?? false;
                          const locked = j.locked.includes(i);
                          const dayName = s.dayNames[i] ?? '';
                          if (!works) {
                            return (
                              <View
                                key={i}
                                accessible
                                accessibilityLabel={t.noDay(j.name, dayName)}
                                style={[styles.cell, styles.col, { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }]}
                              />
                            );
                          }
                          return (
                            <Pressable
                              key={i}
                              accessibilityRole="button"
                              accessibilityLabel={`${p.name} ${dayName}`}
                              accessibilityState={{ selected: on, disabled: locked }}
                              onPress={locked ? undefined : () => setDrafts((cur) => ({ ...cur, [j.id]: toggleCell(cellsOf(j), i, p.id) }))}
                              style={[styles.cell, styles.col, { backgroundColor: on ? brand : colors.surface, opacity: locked ? 0.5 : 1 }]}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}
                {others.length ? (
                  <SelectField
                    label={t.addPerson}
                    options={others.map((p) => ({ value: p.id, label: p.name }))}
                    value={'' as string}
                    onChange={(pid) => {
                      const p = others.find((x) => x.id === pid);
                      if (p) setExtra((cur) => ({ ...cur, [j.id]: [...(cur[j.id] ?? []), p] }));
                    }}
                    renderTrigger={(_l, open) => <AppButton label={t.addPerson} variant="outline" icon="plus" onPress={open} />}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}

      <View style={[styles.note, { backgroundColor: colors.surface }]}>
        <AppText size={12} color={colors.secondary}>
          {changed.length ? `${t.unsaved} ${t.weekNote}` : t.weekNote}
        </AppText>
      </View>
      <AppButton label={t.saveWeek} onPress={() => void save()} disabled={busy || changed.length === 0} />
    </View>
  );
}

/** "18:00:00" como fecha de hoy a esa hora, para mostrarla como "6:00 PM". */
function clockDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = dateFromKey(dayKey(new Date()));
  d.setHours(h, m, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, padding: 12 },
  grid: { borderRadius: 22, padding: 14, gap: 12 },
  wk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { width: 76 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  col: { flex: 1 },
  cell: { height: 34, borderRadius: 10 },
  note: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
});
