import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppAlert } from "../AppAlert";
import { AppText } from "../AppText";
import { Icon } from "../Icon";
import { Segmented } from "../Segmented";
import { ScheduleSimple } from "./ScheduleSimple";
import { ScheduleTable } from "./ScheduleTable";
import { ScheduleWeek } from "./ScheduleWeek";
import { ModeSeg } from "./SimpleParts";
import { VisitApprovalCard } from "./VisitApprovalCard";
import { useSalesStrings } from "@/i18n/useSalesStrings";
import { useStrings } from "@/i18n/useStrings";
import { useWorkStrings } from "@/i18n/useWorkStrings";
import { dateFromKey, formatShortDate } from "@/lib/leadRules";
import {
  fetchSchedule,
  fetchToApprove,
  type ScheduleVisit,
  type VisitCard,
} from "@/lib/scheduleApi";
import {
  scheduleHtml,
  shiftTable,
  tableDays,
  type TableRange,
} from "@/lib/scheduleViews";
import { sharePdf } from "@/lib/sharePdf";
import { usePermissions } from "@/lib/session";
import { can, canAny } from "@/lib/visibility";
import { iconStrokeWidth, sample, useTheme } from "@/theme";

type ScheduleMode = "simple" | "week" | "detail";
const MODES: ScheduleMode[] = ["simple", "week", "detail"];

export const WORK_KEYS = [
  "work_aprobar",
  "work_editar",
  "work_revisar_gps",
  "work_registrar_por_otros",
];

/**
 * Contenido de Schedule & Work (D-214, D-235). Se usa en la pantalla del menú (todos los jobsites) y dentro de cada
 * jobsite con `jobsiteId` (solo ese jobsite). Schedule: Simple (Hoy, 3 días, Semana), Semana (se arma y guarda) y
 * Detallado (tabla Empleado → días por semana o por mes, con Compartir en PDF). Por aprobar por visita (D-266): una
 * tarjeta por visita con Edit, No show, + Agregar persona y Approve.
 */
export function ScheduleWorkPanel({
  jobsiteId,
  initialTab,
}: {
  jobsiteId?: string;
  initialTab?: "schedule" | "approve";
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const seesSchedule = can(access, "schedule_ver_editar");
  const seesWork = canAny(access, WORK_KEYS);
  const [tab, setTab] = useState<"schedule" | "approve">(
    initialTab === "approve" || !seesSchedule ? "approve" : "schedule",
  );
  const [mode, setMode] = useState<ScheduleMode>("simple");
  const [range, setRange] = useState<TableRange>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [notice, setNotice] = useState<string | null>(null);
  const [visits, setVisits] = useState<ScheduleVisit[] | null>(null);
  const [toApprove, setToApprove] = useState<VisitCard[] | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const days = tableDays(range, anchor);
  const from = days[0];
  const to = days[days.length - 1];
  const load = useCallback(async () => {
    setFailed(false);
    if (tab === "schedule" && seesSchedule && mode === "detail") {
      const r = await fetchSchedule(from, to);
      if (r.ok)
        setVisits(
          jobsiteId ? r.data.filter((v) => v.jobsiteId === jobsiteId) : r.data,
        );
      else setFailed(true);
    }
    if (tab === "approve" && seesWork) {
      const r = await fetchToApprove();
      if (r.ok)
        setToApprove(
          jobsiteId ? r.data.filter((w) => w.jobsiteId === jobsiteId) : r.data,
        );
      else setFailed(true);
    }
  }, [tab, mode, from, to, seesSchedule, seesWork, jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!seesSchedule && !seesWork) return null;
  const modeLabel = (m: ScheduleMode) =>
    m === "simple" ? t.modeSimple : m === "week" ? t.modeWeek : t.modeDetail;
  const dayTitle = (key: string) => formatShortDate(dateFromKey(key), s);
  const open = (v: ScheduleVisit) =>
    router.push({
      pathname: "/schedule/visit/[id]",
      params: { id: v.id, day: v.day },
    });
  const rangeTitle =
    range === "month"
      ? `${s.schedule.months[anchor.getMonth()]} ${anchor.getFullYear()}`
      : `${dayTitle(from)} – ${dayTitle(to)}`;

  async function share() {
    setNotice(null);
    const html = scheduleHtml("employee", visits ?? [], days, {
      title: range === 'month' ? t.pdfTitleMonth : t.pdfTitle,
      range: rangeTitle,
      employee: t.employee,
      unstaffed: t.unstaffed,
      noVisits: t.noVisits,
      dayHeaders: strings.home.weekDays,
      dayTitle,
      hours: t.hours,
    });
    const r = await sharePdf(html, range === 'month' ? t.pdfTitleMonth : t.pdfTitle);
    if (r === "unavailable") setNotice(t.shareSoon);
    else if (r === "error") setNotice(t.shareError);
  }

  return (
    <View>
      {seesSchedule && seesWork ? (
        <Segmented
          options={[
            { value: "schedule", label: t.tabSchedule },
            { value: "approve", label: t.tabApprove },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}

      {tab === "schedule" ? (
        <View style={{ marginBottom: 12 }}>
          <ModeSeg
            options={MODES.map((m) => ({ value: m, label: modeLabel(m) }))}
            value={mode}
            onChange={setMode}
          />
        </View>
      ) : null}
      {tab === "schedule" && mode === "simple" ? (
        <ScheduleSimple
          jobsiteId={jobsiteId}
          onError={(e) => setFailed(e !== null)}
        />
      ) : null}
      {tab === "schedule" && mode === "week" ? (
        <ScheduleWeek
          jobsiteId={jobsiteId}
          onError={(e) => setFailed(e !== null)}
        />
      ) : null}

      {tab === "schedule" && mode === "detail" ? (
        <>
          <View style={styles.toolbar}>
            <View style={{ flex: 1 }}>
              <Segmented
                options={[
                  { value: "week", label: t.calWeek },
                  { value: "month", label: t.calMonth },
                ]}
                value={range}
                onChange={(r) => {
                  setNotice(null);
                  setRange(r);
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.share}
              onPress={() => void share()}
              style={[styles.share, { backgroundColor: colors.card }]}
            >
              <Icon
                name="share"
                size={18}
                strokeWidth={iconStrokeWidth}
                color={colors.text}
              />
              <AppText size={13} weight="bold">
                {t.share}
              </AppText>
            </Pressable>
          </View>
          {notice ? <AppAlert text={notice} /> : null}
          <View style={[styles.week, { backgroundColor: colors.card }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.previous}
              onPress={() => setAnchor((a) => shiftTable(range, a, -1))}
              hitSlop={12}
            >
              <Icon
                name="chevron-left"
                size={20}
                strokeWidth={iconStrokeWidth}
                color={colors.text}
              />
            </Pressable>
            <AppText weight="bold">{rangeTitle}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.next}
              onPress={() => setAnchor((a) => shiftTable(range, a, 1))}
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
          {visits ? (
            <ScheduleTable
              mode="employee"
              visits={visits}
              days={days}
              onOpen={open}
            />
          ) : null}
        </>
      ) : null}

      {tab === "approve" ? (
        <View style={{ gap: 10 }}>
          {toApprove && toApprove.length === 0 ? (
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.nothingToApprove}
            </AppText>
          ) : null}
          {approveError ? <AppAlert tone="error" text={approveError} /> : null}
          {/* D-266: una tarjeta por visita con sus personas; se aprueba de a una visita. */}
          {(toApprove ?? []).map((w) => (
            <VisitApprovalCard
              key={w.id}
              card={w}
              onChanged={load}
              onError={setApproveError}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
});
