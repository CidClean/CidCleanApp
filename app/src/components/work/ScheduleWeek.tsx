import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppAlert } from "../AppAlert";
import { AppButton } from "../AppButton";
import { AppText } from "../AppText";
import { Dialog } from "../Dialog";
import { Icon } from "../Icon";
import type { Clock } from "../PickerField";
import { SelectField } from "../SelectField";
import { ClockField } from "./ClockField";
import { HoursField } from "./HoursField";
import { DialogButtons, Initial } from "./SimpleParts";
import { useSalesStrings } from "@/i18n/useSalesStrings";
import { useWorkStrings } from "@/i18n/useWorkStrings";
import { dateFromKey, dayKey, formatShortDate } from "@/lib/leadRules";
import {
  fetchWeekPlan,
  saveWeek,
  setJobsiteVisitTime,
  type WeekPlan,
  type WeekSite,
} from "@/lib/scheduleApi";
import { addDays, formatMinutes, sundayOf } from "@/lib/scheduleRules";
import { copyWeek, sameCells, toggleCell } from "@/lib/scheduleViews";
import { formatTime } from "@/lib/week";
import { iconStrokeWidth, useTheme } from "@/theme";

// Letras de la cuadrícula tal como la muestra aprobada (D-232).

type Person = { id: string; name: string };

/**
 * Modo Semana (D-232; reemplaza "Equipos fijos" de la muestra): el horario se arma semana por semana. Por jobsite, una
 * cuadrícula D L M X J V S (D-269) × persona de la semana elegida (flechas para cambiar de semana); solo los días que el
 * jobsite trabaja se marcan. "Guardar semana" crea o cambia las visitas de esa semana con la regla de 32 h (aviso desde
 * 28 h y bloqueo). Una semana sin guardar se ve vacía; "Copiar semana anterior" la llena con la anterior (D-200).
 */
export function ScheduleWeek({
  onError,
  jobsiteId,
}: {
  onError: (text: string | null) => void;
  jobsiteId?: string;
}) {
  const { colors, brand } = useTheme();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const [sunday, setSunday] = useState(() => sundayOf(new Date()));
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[][]>>({});
  const [extra, setExtra] = useState<Record<string, Person[]>>({});
  const [notice, setNotice] = useState<{
    tone: "error" | "warning" | "success";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // "Poner hora" desde la tarjeta (D-234): ventana al centro con hora y duración que se guardan en el jobsite.
  const [timeFor, setTimeFor] = useState<WeekSite | null>(null);
  const [clock, setClock] = useState<Clock | null>(null);
  const [mins, setMins] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const key = dayKey(sunday);
  // Dentro de un jobsite solo se arma la semana de ese jobsite (D-235).
  const scoped = (p: WeekPlan): WeekPlan =>
    jobsiteId
      ? { ...p, jobsites: p.jobsites.filter((j) => j.id === jobsiteId) }
      : p;

  const load = useCallback(async () => {
    const r = await fetchWeekPlan(key);
    if (!r.ok) {
      onError(t.errorLoad);
      return;
    }
    onError(null);
    setPlan(scoped(r.data));
    setDrafts({});
    setExtra({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cellsOf = (j: WeekSite) => drafts[j.id] ?? j.cells;
  const changed = (plan?.jobsites ?? []).filter(
    (j) => drafts[j.id] && !sameCells(drafts[j.id], j.cells),
  );
  const empty =
    plan !== null &&
    plan.jobsites.every((j) => j.cells.every((c) => c.length === 0));

  function move(dir: 1 | -1) {
    setNotice(null);
    setSunday((d) => addDays(d, 7 * dir));
  }

  async function copyPrevious() {
    if (!plan) return;
    setNotice(null);
    const r = await fetchWeekPlan(dayKey(addDays(sunday, -7)));
    if (!r.ok) {
      setNotice({ tone: "error", text: t.errorLoad });
      return;
    }
    const c = copyWeek(plan.jobsites, r.data.jobsites, drafts);
    setDrafts((cur) => ({ ...cur, ...c.cells }));
    setExtra((cur) => {
      const next = { ...cur };
      for (const [id, list] of Object.entries(c.people))
        next[id] = [
          ...(next[id] ?? []),
          ...list.filter((p) => !(next[id] ?? []).some((x) => x.id === p.id)),
        ];
      return next;
    });
  }

  async function save() {
    if (busy || changed.length === 0) return;
    setBusy(true);
    setNotice(null);
    const r = await saveWeek(
      key,
      changed.map((j) => ({ jobsite: j.id, cells: drafts[j.id] })),
    );
    setBusy(false);
    if (!r.ok) {
      const text =
        r.reason === "over_32"
          ? t.over32(r.detail ?? "")
          : r.reason === "contract_pending"
            ? t.errorContract(r.detail ?? "")
            : r.reason === "no_time"
            ? t.errorNoTime
            : r.reason === "no_day"
              ? t.errorNoDay
              : t.errorSave;
      setNotice({ tone: "error", text });
      return;
    }
    await load();
    setNotice(
      r.data.length
        ? {
            tone: "warning",
            text: t.warn28(r.data.map((w) => w.name).join(", ")),
          }
        : { tone: "success", text: t.weekSaved },
    );
  }

  function openTime(j: WeekSite) {
    setTimeFor(j);
    if (j.startTime) {
      const [h, m] = j.startTime.split(":").map(Number);
      setClock({ hours: h, minutes: m });
    } else setClock(null);
    setMins(j.minutes ? String(j.minutes) : "");
    setTimeError(null);
  }

  async function saveTime() {
    if (!timeFor) return;
    const m = Number(mins);
    if (!clock || !(m >= 15 && m <= 1440)) {
      setTimeError(t.errorDuration);
      return;
    }
    setBusy(true);
    const r = await setJobsiteVisitTime(
      timeFor.id,
      `${String(clock.hours).padStart(2, "0")}:${String(clock.minutes).padStart(2, "0")}`,
      m,
    );
    setBusy(false);
    if (!r.ok) {
      setTimeError(t.errorSave);
      return;
    }
    setTimeFor(null);
    // Se vuelve a leer la semana sin perder lo marcado en otros jobsites.
    const w = await fetchWeekPlan(key);
    if (w.ok) setPlan(scoped(w.data));
  }

  const end = addDays(sunday, 6);
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.week, { backgroundColor: colors.card }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.previousWeek}
          onPress={() => move(-1)}
          hitSlop={12}
        >
          <Icon
            name="chevron-left"
            size={20}
            strokeWidth={iconStrokeWidth}
            color={colors.text}
          />
        </Pressable>
        <AppText weight="bold">{`${formatShortDate(sunday, s)} – ${formatShortDate(end, s)}`}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.followingWeek}
          onPress={() => move(1)}
          hitSlop={12}
        >
          <Icon
            name="chevron-right"
            size={20}
            strokeWidth={iconStrokeWidth}
            color={colors.text}
          />
        </Pressable>
      </View>
      {notice ? (
        <AppAlert
          tone={notice.tone === "success" ? undefined : notice.tone}
          text={notice.text}
        />
      ) : null}
      {empty && changed.length === 0 ? (
        <AppText size={13} color={colors.secondary}>
          {t.weekEmpty}
        </AppText>
      ) : null}
      {plan ? (
        <AppButton
          label={t.copyPrevious}
          variant="outline"
          onPress={() => void copyPrevious()}
        />
      ) : null}

      {(plan?.jobsites ?? []).map((j) => {
        const cells = cellsOf(j);
        const rows: Person[] = [
          ...j.people,
          ...(extra[j.id] ?? []).filter(
            (p) => !j.people.some((x) => x.id === p.id),
          ),
        ];
        const others = (plan?.staff ?? []).filter(
          (p) => !rows.some((r) => r.id === p.id),
        );
        const time =
          j.startTime && j.minutes
            ? `${formatTime(clockDate(j.startTime))} · ${formatMinutes(j.minutes, t.hours)}`
            : null;
        return (
          <View
            key={j.id}
            style={[styles.grid, { backgroundColor: colors.card }]}
          >
            <AppText weight="heavy" size={16}>
              {j.name}
            </AppText>
            <AppText
              size={12}
              color={colors.secondary}
              style={{ marginTop: -8 }}
            >
              {time ? `${time} · ${t.weekHint}` : t.noTimeSite}
            </AppText>
            {time ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openTime(j)}
                hitSlop={8}
                style={{ alignSelf: "flex-start", marginTop: -6 }}
              >
                <AppText size={13} weight="bold" color={colors.brandText}>
                  {t.changeTime}
                </AppText>
              </Pressable>
            ) : (
              <AppButton
                label={t.setTime}
                icon="clock"
                onPress={() => openTime(j)}
              />
            )}
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
                      {s.schedule.weekDays.map((d, i) => (
                        <AppText
                          key={i}
                          size={11}
                          weight="bold"
                          color={colors.secondary}
                          center
                          style={styles.col}
                        >
                          {d}
                        </AppText>
                      ))}
                    </View>
                    {rows.map((p) => (
                      <View key={p.id} style={styles.wk}>
                        <View style={[styles.name, styles.nameRow]}>
                          <Initial id={p.id} name={p.name} />
                          <AppText
                            size={13}
                            weight="bold"
                            numberOfLines={1}
                            style={{ flexShrink: 1 }}
                          >
                            {p.name}
                          </AppText>
                        </View>
                        {s.schedule.weekDays.map((_, i) => {
                          const works = j.days.includes(i);
                          const on = cells[i]?.includes(p.id) ?? false;
                          const locked = j.locked.includes(i);
                          const dayName = s.dayNames[i] ?? "";
                          if (!works) {
                            return (
                              <View
                                key={i}
                                accessible
                                accessibilityLabel={t.noDay(j.name, dayName)}
                                style={[
                                  styles.cell,
                                  styles.col,
                                  {
                                    borderWidth: 1,
                                    borderStyle: "dashed",
                                    borderColor: colors.border,
                                  },
                                ]}
                              />
                            );
                          }
                          return (
                            <Pressable
                              key={i}
                              accessibilityRole="button"
                              accessibilityLabel={`${p.name} ${dayName}`}
                              accessibilityState={{
                                selected: on,
                                disabled: locked,
                              }}
                              onPress={
                                locked
                                  ? undefined
                                  : () =>
                                      setDrafts((cur) => ({
                                        ...cur,
                                        [j.id]: toggleCell(cellsOf(j), i, p.id),
                                      }))
                              }
                              style={[
                                styles.cell,
                                styles.col,
                                {
                                  backgroundColor: on ? brand : colors.surface,
                                  opacity: locked ? 0.5 : 1,
                                },
                              ]}
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
                    options={others.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    value={"" as string}
                    onChange={(pid) => {
                      const p = others.find((x) => x.id === pid);
                      if (p)
                        setExtra((cur) => ({
                          ...cur,
                          [j.id]: [...(cur[j.id] ?? []), p],
                        }));
                    }}
                    renderTrigger={(_l, open) => (
                      <AppButton
                        label={t.addPerson}
                        variant="outline"
                        icon="plus"
                        onPress={open}
                      />
                    )}
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
      <AppButton
        label={t.saveWeek}
        onPress={() => void save()}
        disabled={busy || changed.length === 0}
      />

      <Dialog visible={timeFor !== null} onClose={() => setTimeFor(null)}>
        <AppText weight="heavy" size={17}>
          {timeFor ? t.setTimeTitle(timeFor.name) : ""}
        </AppText>
        {timeError ? <AppAlert tone="error" text={timeError} /> : null}
        <ClockField label={t.jobsiteTime} value={clock} onChange={setClock} />
        <HoursField label={t.jobsiteDuration} value={mins} onChange={setMins} />
        <DialogButtons
          cancel={t.cancel}
          save={t.save}
          onCancel={() => setTimeFor(null)}
          onSave={() => void saveTime()}
          disabled={busy}
        />
      </Dialog>
    </View>
  );
}

/** "18:00:00" como fecha de hoy a esa hora, para mostrarla como "6:00 PM". */
function clockDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = dateFromKey(dayKey(new Date()));
  d.setHours(h, m, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  week: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 12,
  },
  grid: { borderRadius: 22, padding: 14, gap: 12 },
  wk: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { width: 76 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  col: { flex: 1 },
  cell: { height: 34, borderRadius: 10 },
  note: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
});
