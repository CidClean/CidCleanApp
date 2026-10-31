import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { CardBlock } from "@/components/bento/Card";
import { AppAlert } from "@/components/AppAlert";
import { AppButton } from "@/components/AppButton";
import { AppField } from "@/components/AppField";
import { AppText } from "@/components/AppText";
import { Chip } from "@/components/Chip";
import { DataRow } from "@/components/DataRow";
import { Icon } from "@/components/Icon";
import { ListRow } from "@/components/ListRow";
import {
  ScheduleWorkPanel,
  WORK_KEYS,
} from "@/components/work/ScheduleWorkPanel";
import { saveLocation } from "@/lib/jobsiteLocation";
import { SelectField } from "@/components/SelectField";
import { Sheet } from "@/components/Sheet";
import { Bento, Card } from "@/components/bento/Card";
import { BackHeader } from "@/components/bento/Header";
import { MainCard } from "@/components/bento/MainCard";
import {
  DocIcon,
  LeadCalendarIcon,
  PeopleIcon,
} from "@/components/illustrations";
import { useSalesStrings } from "@/i18n/useSalesStrings";
import { JobsiteExtras } from "@/components/quotes/JobsiteExtras";
import { ContractCard } from "@/components/contract/ContractCard";
import { CleaningTypeField } from "@/components/contract/CleaningTypeField";
import { AccountMonthCard } from "@/components/accounting/AccountMonthCard";
import { UsDateField } from "@/components/UsDateField";
import type { ClientsStrings } from "@/i18n/clients";
import { useClientsStrings } from "@/i18n/useClientsStrings";
import { useStrings } from "@/i18n/useStrings";
import {
  canAssign,
  canChangeStatus,
  canCreateLegacy,
  canEditClientData,
  canSeeAccounts,
  canSeePay,
  canSeeRate,
  canSetPay,
  cityFrom,
  frequencyLabel,
  money,
  parseMoney,
  paySummary,
  statusChangeNeedsConfirm,
  statusOptions,
  statusTone,
  uploadableKinds,
  type DocKind,
  type Jobsite,
  type JobsiteStatus,
  type Pay,
  type StaffRow,
  isDirectJobsite,
} from "@/lib/clientRules";
import { canAny } from "@/lib/visibility";
import {
  choosePdf,
  endAssignment,
  fetchDocuments,
  fetchJobsite,
  fetchJobsiteStaff,
  fetchMargin,
  fetchPay,
  fetchRate,
  setJobsiteRate,
  setJobsiteStatus,
  uploadJobsiteDocument,
  type JobsiteDocument,
  type Margin,
  type PickedPdf,
} from "@/lib/clientsApi";
import { formatDate } from "@/lib/employeeRules";
import {
  dateFromKey,
  dayKey,
  formatUsDate,
  parseUsDate,
} from "@/lib/leadRules";
import { useGoBack } from "@/lib/navigation";
import { formatPhone } from "@/lib/phone";
import { formatCoordinates, plusCodeToCoordinates } from "@/lib/plusCode";
import { usePermissions, useSession } from "@/lib/session";
import { iconStrokeWidth, sample, useTheme } from "@/theme";

type Tab = "summary" | "documents" | "staff" | "schedule";

/**
 * Detalle del jobsite (D-055; diseño bajo D-208): encabezado con nombre, ciudad, tarifa mensual (con permiso) y ficha
 * de estado, y pestañas Resumen, Documentos, Personal y Horario con subrayado de 2px. Horario queda "Pendiente" hasta
 * el hito 6. Editar en la barra (D-174) abre el formulario de datos y contactos.
 */
export default function JobsiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const s = useSalesStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const [jobsite, setJobsite] = useState<Jobsite | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [margin, setMargin] = useState<Margin | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const seesRate = canSeeRate(access);
  const seesSchedule = canAny(access, ["schedule_ver_editar", ...WORK_KEYS]);

  const load = useCallback(async () => {
    const r = await fetchJobsite(id);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setJobsite(r.data);
    if (seesRate) {
      const [rt, m] = await Promise.all([fetchRate(id), fetchMargin(id)]);
      if (rt.ok) setRate(rt.data);
      if (m.ok) setMargin(m.data);
    }
  }, [id, seesRate]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!canSeeAccounts(access)) return <Redirect href="/" />;

  const atRisk = jobsite?.status === "active" && margin?.atRisk;
  const city = jobsite ? cityFrom(jobsite.address) : "";
  const day = (key: string) =>
    formatDate(dateFromKey(key).toISOString(), locale);
  const tabLabel = (t: Tab) =>
    t === "documents"
      ? c.jobsite.tabDocuments
      : t === "staff"
        ? c.jobsite.tabStaff
        : t === "schedule"
          ? c.jobsite.tabSchedule
          : c.jobsite.tabSummary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={tab === "summary" ? goBack : () => setTab("summary")}
        backLabel={strings.common.back}
        title={tab === "summary" ? undefined : tabLabel(tab)}
        action={
          tab === "summary" &&
          jobsite &&
          canEditClientData(access) &&
          jobsite.status !== "terminated"
            ? {
                label: c.jobsite.edit,
                onPress: () =>
                  router.push({
                    pathname: "/jobsites/[id]/edit",
                    params: { id },
                  }),
              }
            : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {failed && !jobsite ? (
          <AppAlert tone="error" text={c.jobsite.errorLoad} />
        ) : null}
        {jobsite ? (
          <>
            {tab === "summary" ? (
              <>
                {/* D-226: tarjeta principal de marca y mosaico que abre Documentos, Personal y Horario (D-055). */}
                <MainCard
                  title={jobsite.name}
                  subtitle={[jobsite.clientName, city]
                    .filter(Boolean)
                    .join(" · ")}
                  figure={
                    seesRate && rate !== null
                      ? c.perMonth(money(rate))
                      : undefined
                  }
                  chip={atRisk ? c.atRisk : c.status[jobsite.status]}
                  contact={{
                    phone: jobsite.contactPhone,
                    email: jobsite.contactEmail,
                    callLabel: s.detail.call,
                    mailLabel: s.detail.mail,
                  }}
                />
                {jobsite.clientAccountProvider ? (
                  <View style={{ flexDirection: "row", marginTop: 8 }}>
                    <Chip label={c.accountProvider} />
                  </View>
                ) : null}
                <Bento>
                  <Card
                    onPress={() => setTab("documents")}
                    accessibilityLabel={c.jobsite.tabDocuments}
                    style={{ gap: 10 }}
                  >
                    <DocIcon />
                    <AppText weight="heavy" size={15}>
                      {c.jobsite.tabDocuments}
                    </AppText>
                  </Card>
                  <Card
                    onPress={() => setTab("staff")}
                    accessibilityLabel={c.jobsite.tabStaff}
                    style={{ gap: 10 }}
                  >
                    <PeopleIcon />
                    <AppText weight="heavy" size={15}>
                      {c.jobsite.tabStaff}
                    </AppText>
                  </Card>
                  {seesSchedule ? (
                    <Card
                      tone="dark"
                      wide
                      onPress={() => {
                        setTab("schedule");
                        // Jobsites guardados antes del hito 6: su ubicación sale del Plus Code al abrir el Schedule (D-200).
                        if (
                          canAny(access, ["clientes_editar_datos"]) &&
                          jobsite.plusCode
                        )
                          void saveLocation(jobsite.id, jobsite.plusCode);
                      }}
                      accessibilityLabel={c.jobsite.tabSchedule}
                      style={styles.scheduleTile}
                    >
                      <LeadCalendarIcon />
                      <View style={{ flex: 1 }}>
                        <AppText
                          weight="heavy"
                          size={15}
                          color={colors.darkCardText}
                        >
                          {c.jobsite.tabSchedule}
                        </AppText>
                      </View>
                    </Card>
                  ) : null}
                </Bento>
                <View style={{ height: 12 }} />
                {/* Orden 27: lo del mes de la cuenta, si quien mira ve tarifas y el dashboard por cuenta. */}
                <AccountMonthCard jobsiteId={jobsite.id} />
              </>
            ) : null}
            {tab === "summary" ? (
              <Summary
                jobsite={jobsite}
                c={c}
                rate={rate}
                margin={margin}
                day={day}
                onChanged={load}
              />
            ) : null}
            {/* D-289: contrato del cliente y tipo de limpieza. */}
            {tab === "summary" ? (
              <>
                <ContractCard jobsiteId={jobsite.id} />
                <CleaningTypeField kind="jobsite" id={jobsite.id} canEdit={canAny(access, ["clientes_editar_datos"])} />
              </>
            ) : null}
            {/* D-238: quotes de extra de la cuenta y "Nuevo quote". */}
            {tab === "summary" ? (
              <JobsiteExtras
                jobsiteId={jobsite.id}
                terminated={jobsite.status === "terminated"}
              />
            ) : null}
            {tab === "documents" ? (
              <Documents jobsite={jobsite} c={c} day={day} />
            ) : null}
            {tab === "staff" ? (
              <Staff jobsite={jobsite} c={c} day={day} onChanged={load} />
            ) : null}
            {/* D-235: Schedule & Work de este jobsite (reemplaza la pestaña Horario); la hora se pone en Semana (D-234). */}
            {tab === "schedule" ? (
              <ScheduleWorkPanel jobsiteId={jobsite.id} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// --- Resumen ------------------------------------------------------------------------------------------------

function Summary({
  jobsite,
  c,
  rate,
  margin,
  day,
  onChanged,
}: {
  jobsite: Jobsite;
  c: ClientsStrings;
  rate: number | null;
  margin: Margin | null;
  day: (key: string) => string;
  onChanged: () => Promise<void>;
}) {
  const { colors, status: statusColors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const [confirm, setConfirm] = useState<JobsiteStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateText, setRateText] = useState("");
  const [rateError, setRateError] = useState(false);
  const [busy, setBusy] = useState(false);
  const none = c.jobsite.none;
  const rateEditable =
    isDirectJobsite(jobsite) &&
    canCreateLegacy(access) &&
    jobsite.status !== "terminated";
  const v = (x: string | null | undefined) => (x && x.trim() !== "" ? x : none);
  const coords = jobsite.plusCode
    ? plusCodeToCoordinates(jobsite.plusCode)
    : null;
  const freq = frequencyLabel(jobsite.frequency, {
    daily: c.form.daily,
    other: c.form.other,
    days: c.form.days,
    and: c.form.and,
  });

  async function applyStatus(next: JobsiteStatus) {
    setBusy(true);
    setStatusError(false);
    const r = await setJobsiteStatus(jobsite.id, next);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) setStatusError(true);
    await onChanged();
  }

  async function saveRate() {
    const n = parseMoney(rateText);
    if (n === null) {
      setRateError(true);
      return;
    }
    setBusy(true);
    const r = await setJobsiteRate(jobsite.id, n);
    setBusy(false);
    if (!r.ok) {
      setRateError(true);
      return;
    }
    setRateOpen(false);
    await onChanged();
  }

  const contact = [
    jobsite.contactName,
    formatPhone(jobsite.contactPhone),
    jobsite.contactEmail,
  ]
    .filter((x) => x && x.trim() !== "")
    .join(" · ");
  const emergency = [
    jobsite.emergencyName,
    jobsite.emergencyRelation,
    formatPhone(jobsite.emergencyPhone),
    jobsite.emergencyEmail,
  ]
    .filter((x) => x && x.trim() !== "")
    .join(" · ");
  // Alerta de margen (D-060): barra de 8px ámbar con las cifras de costo y tarifa, y ficha "Margen en riesgo".
  const showMargin =
    margin && margin.cost !== null && margin.rate !== null && margin.rate > 0;
  const ratio = showMargin
    ? Math.min(1, (margin.cost as number) / (margin.rate as number))
    : 0;

  return (
    <View>
      {canChangeStatus(access) ? (
        <SelectField
          label={c.jobsite.status}
          options={statusOptions(jobsite.status).map((s) => ({
            value: s,
            label: c.status[s],
          }))}
          value={jobsite.status}
          onChange={(next) => {
            if (next === jobsite.status) return;
            if (statusChangeNeedsConfirm(jobsite.status, next))
              setConfirm(next);
            else void applyStatus(next);
          }}
        />
      ) : null}
      {statusError ? (
        <AppAlert tone="error" text={c.jobsite.errorStatus} />
      ) : null}

      {showMargin ? (
        <View style={{ marginBottom: 10 }}>
          <View style={styles.marginHead}>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {c.margin.cost}
            </AppText>
            {margin.atRisk ? <Chip label={c.atRisk} tone="warning" /> : null}
          </View>
          <View style={[styles.bar, { backgroundColor: colors.surface }]}>
            <View
              style={{
                width: `${Math.round(ratio * 100)}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: margin.atRisk
                  ? statusColors.warning
                  : statusColors.success,
              }}
            />
          </View>
          <AppText
            size={sample.noteSize}
            color={colors.secondary}
            style={{ marginTop: 4 }}
          >
            {c.margin.of(
              money(margin.cost as number),
              money(margin.rate as number),
            )}
          </AppText>
          {margin.incomplete ? (
            <AppText
              size={sample.noteSize}
              color={colors.secondary}
              style={{ marginTop: 2 }}
            >
              {c.margin.incomplete}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* La tarifa va en el encabezado (D-055); aquí solo la fila con lápiz para un cliente previo (D-210). */}
      {rateEditable && rate !== null ? (
        <DataRow
          label={c.jobsite.rate}
          value={c.perMonth(money(rate))}
          right={
            <Icon
              name="pencil"
              size={18}
              strokeWidth={iconStrokeWidth}
              color={colors.text}
            />
          }
          onPress={() => {
            setRateText(String(rate));
            setRateError(false);
            setRateOpen(true);
          }}
        />
      ) : null}
      <CardBlock>
        <DataRow label={c.jobsite.address} value={v(jobsite.address)} />
        <DataRow
          label={c.jobsite.plusCode}
          value={
            jobsite.plusCode
              ? coords
                ? `${jobsite.plusCode} · ${formatCoordinates(coords)}`
                : jobsite.plusCode
              : none
          }
        />
        <DataRow label={c.jobsite.contact} value={v(contact)} />
        <DataRow label={c.jobsite.emergency} value={v(emergency)} />
        <DataRow label={c.jobsite.frequency} value={v(freq)} />
        <DataRow
          label={c.jobsite.estHours}
          value={
            jobsite.estHoursPerVisit === null
              ? none
              : String(jobsite.estHoursPerVisit)
          }
        />
        <DataRow
          label={c.jobsite.startDate}
          value={jobsite.startDate ? day(jobsite.startDate) : none}
        />
        <DataRow
          label={c.jobsite.walkthrough}
          value={
            jobsite.walkthroughVersion
              ? c.jobsite.walkthroughVersion(jobsite.walkthroughVersion)
              : jobsite.clientLegacy
                ? c.legacy
                : none
          }
          last
        />
      </CardBlock>
      {!isDirectJobsite(jobsite) && canSeeRate(access) ? (
        <AppText
          size={sample.noteSize}
          color={colors.secondary}
          style={{ marginTop: 6 }}
        >
          {c.jobsite.rateQuoteNote}
        </AppText>
      ) : null}

      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {confirm === "terminated"
            ? c.jobsite.terminateTitle(jobsite.name)
            : c.jobsite.pauseTitle(jobsite.name)}
        </AppText>
        <AppText
          size={sample.noteSize}
          color={colors.secondary}
          center
          style={{ marginTop: 4 }}
        >
          {confirm === "terminated"
            ? c.jobsite.terminateBody
            : c.jobsite.pauseBody}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton
              label={strings.common.cancel}
              variant="outline"
              onPress={() => setConfirm(null)}
            />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={
                confirm === "terminated"
                  ? c.jobsite.confirmTerminate
                  : c.jobsite.confirmPause
              }
              onPress={() => confirm && void applyStatus(confirm)}
              disabled={busy}
            />
          </View>
        </View>
      </Sheet>
      <Sheet visible={rateOpen} onClose={() => setRateOpen(false)}>
        <AppText
          weight="medium"
          size={sample.headingSize}
          style={{ marginBottom: 8 }}
        >
          {c.jobsite.rateTitle}
        </AppText>
        <AppField
          label={c.form.rate}
          value={rateText}
          onChangeText={(t) => {
            setRateText(t);
            setRateError(false);
          }}
          keyboardType="decimal-pad"
          error={rateError ? c.form.errorRate : null}
        />
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton
              label={strings.common.cancel}
              variant="outline"
              onPress={() => setRateOpen(false)}
            />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={strings.common.save}
              onPress={() => void saveRate()}
              disabled={busy}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

// --- Documentos ----------------------------------------------------------------------------------------------

function Documents({
  jobsite,
  c,
  day,
}: {
  jobsite: Jobsite;
  c: ClientsStrings;
  day: (key: string) => string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const [docs, setDocs] = useState<JobsiteDocument[] | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocKind>("contract");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [error, setError] = useState<"title" | "upload" | null>(null);
  const [busy, setBusy] = useState(false);
  const kinds = uploadableKinds(access);

  const load = useCallback(async () => {
    const r = await fetchDocuments(jobsite.id);
    if (r.ok) setDocs(r.data);
  }, [jobsite.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const label = (d: JobsiteDocument) =>
    d.kind === "other" ? (d.title ?? c.docs.other) : c.docs[d.kind];
  const sow = docs?.find((d) => d.kind === "sow");
  const contract = docs?.find((d) => d.kind === "contract");
  const others = docs?.filter((d) => d.kind === "other") ?? [];
  const seesContract = canSeeRate(access);
  const openDoc = (d: JobsiteDocument) =>
    router.push({
      pathname: "/viewer",
      params: { source: "jobsite", documentId: d.id, title: label(d) },
    });
  const detail = (d: JobsiteDocument) =>
    c.docs.detail(d.version, day(dayKey(new Date(d.uploadedAt))));

  async function upload() {
    if (busy) return;
    if (kind === "other" && title.trim() === "") {
      setError("title");
      return;
    }
    if (!file) return;
    setBusy(true);
    setError(null);
    const r = await uploadJobsiteDocument(
      jobsite.id,
      kind,
      file,
      kind === "other" ? title.trim() : null,
    );
    setBusy(false);
    if (!r.ok) {
      setError("upload");
      return;
    }
    setOpen(false);
    setFile(null);
    setTitle("");
    await load();
  }

  return (
    <View>
      <CardBlock>
        <ListRow
          title={c.docs.sow}
          detail={sow ? detail(sow) : c.docs.missing}
          chevron={Boolean(sow)}
          onPress={sow ? () => openDoc(sow) : undefined}
        />
        {/* D-210: el contrato exige ver tarifa; cada apertura queda en el historial. */}
        {seesContract ? (
          <ListRow
            title={c.docs.contract}
            detail={contract ? detail(contract) : c.docs.missing}
            chevron={Boolean(contract)}
            onPress={contract ? () => openDoc(contract) : undefined}
            last={others.length === 0}
          />
        ) : null}
        {others.map((d, i) => (
          <ListRow
            key={d.id}
            title={label(d)}
            detail={detail(d)}
            chevron
            last={i === others.length - 1}
            onPress={() => openDoc(d)}
          />
        ))}
      </CardBlock>
      {kinds.length > 0 && jobsite.status !== "terminated" ? (
        <View style={{ marginTop: 12 }}>
          <AppButton
            label={c.docs.upload}
            variant="outline"
            icon="upload"
            onPress={() => {
              setKind(kinds.includes("contract") ? "contract" : kinds[0]);
              setFile(null);
              setTitle("");
              setError(null);
              setOpen(true);
            }}
          />
        </View>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText
          weight="medium"
          size={sample.headingSize}
          style={{ marginBottom: 8 }}
        >
          {c.docs.chooseKind}
        </AppText>
        {kinds.map((k, i) => (
          <Pressable
            key={k}
            accessibilityRole="radio"
            accessibilityState={{ checked: kind === k }}
            onPress={() => setKind(k)}
            style={[
              styles.option,
              {
                borderBottomColor: colors.border,
                borderBottomWidth: i === kinds.length - 1 ? 0 : 0.5,
              },
            ]}
          >
            <AppText weight={kind === k ? "medium" : "regular"}>
              {c.docs[k]}
            </AppText>
            {kind === k ? (
              <Icon
                name="check"
                size={18}
                strokeWidth={iconStrokeWidth}
                color={colors.text}
              />
            ) : null}
          </Pressable>
        ))}
        {kind === "other" ? (
          <AppField
            label={c.docs.title}
            value={title}
            onChangeText={setTitle}
            error={error === "title" ? c.docs.errorTitle : null}
          />
        ) : null}
        <AppButton
          label={file?.name ?? c.docs.chooseFile}
          variant="outline"
          icon="file-text"
          onPress={() => void choosePdf().then((f) => f && setFile(f))}
        />
        {error === "upload" ? (
          <AppAlert tone="error" text={c.docs.errorUpload} />
        ) : null}
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton
              label={strings.common.cancel}
              variant="outline"
              onPress={() => setOpen(false)}
            />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={c.docs.upload}
              onPress={() => void upload()}
              disabled={busy || !file}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

// --- Personal --------------------------------------------------------------------------------------------------

function Staff({
  jobsite,
  c,
  day,
  onChanged,
}: {
  jobsite: Jobsite;
  c: ClientsStrings;
  day: (key: string) => string;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [pay, setPay] = useState<Map<string, Pay | null>>(new Map());
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<StaffRow | null>(null);
  const [end, setEnd] = useState("");
  const [endError, setEndError] = useState(false);
  const [busy, setBusy] = useState(false);
  const seesPay = canSeePay(access);

  const load = useCallback(async () => {
    const r = await fetchJobsiteStaff(jobsite.id);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(r.data);
    if (seesPay) {
      const p = await fetchPay({ jobsite: jobsite.id });
      if (p.ok) setPay(p.data);
    }
  }, [jobsite.id, seesPay]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sumStrings = {
    perHour: c.pay.summaryHour,
    guaranteed: c.pay.summaryGuaranteed,
    visit: c.pay.summaryVisit,
    week: c.pay.summaryWeek,
    month: c.pay.summaryMonth,
    none: c.staff.noPay,
  };

  async function remove() {
    if (!removing || busy) return;
    const key = parseUsDate(end);
    if (!key || key === "invalid" || key < dayKey(new Date())) {
      setEndError(true);
      return;
    }
    setBusy(true);
    const r = await endAssignment(removing.assignmentId, key);
    setBusy(false);
    if (!r.ok) {
      setEndError(true);
      return;
    }
    setRemoving(null);
    await load();
    await onChanged();
  }

  const editable = jobsite.status !== "terminated";
  return (
    <View>
      {failed ? <AppAlert tone="error" text={c.staff.errorLoad} /> : null}
      {rows && rows.length === 0 ? (
        <AppText
          size={sample.noteSize}
          color={colors.secondary}
          style={{ marginBottom: 8 }}
        >
          {c.staff.empty}
        </AppText>
      ) : null}
      {rows && rows.length > 0 ? (
        <CardBlock>
          {rows.map((r, i) => {
            const dates = [
              c.staff.since(day(r.startDate)),
              r.endDate ? c.staff.until(day(r.endDate)) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const detail = seesPay
              ? `${paySummary(pay.get(r.assignmentId) ?? null, sumStrings)} · ${dates}`
              : dates;
            const openPay = canSetPay(access) && editable;
            return (
              <ListRow
                key={r.assignmentId}
                title={r.fullName}
                detail={detail}
                chevron={openPay && !canAssign(access)}
                right={
                  canAssign(access) && editable && !r.endDate ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={c.assign.remove}
                      hitSlop={8}
                      onPress={() => {
                        setEnd(formatUsDate(dayKey(new Date())));
                        setEndError(false);
                        setRemoving(r);
                      }}
                    >
                      <Icon
                        name="trash"
                        size={18}
                        strokeWidth={iconStrokeWidth}
                        color={colors.text}
                      />
                    </Pressable>
                  ) : undefined
                }
                last={i === rows.length - 1}
                onPress={
                  openPay
                    ? () =>
                        router.push({
                          pathname: "/pay/[assignment]",
                          params: {
                            assignment: r.assignmentId,
                            jobsite: jobsite.name,
                            workerType: r.workerType ?? "",
                            jobsiteId: jobsite.id,
                          },
                        })
                    : undefined
                }
              />
            );
          })}
        </CardBlock>
      ) : null}
      {canAssign(access) && editable ? (
        <View style={{ marginTop: 12 }}>
          <AppButton
            label={c.staff.assign}
            variant="outline"
            icon="plus"
            onPress={() =>
              router.push({
                pathname: "/assign",
                params: { jobsite: jobsite.id },
              })
            }
          />
        </View>
      ) : null}
      <Sheet visible={removing !== null} onClose={() => setRemoving(null)}>
        <AppText
          weight="medium"
          size={sample.headingSize}
          center
          style={{ marginBottom: 8 }}
        >
          {removing
            ? c.assign.removeTitle(removing.fullName, jobsite.name)
            : ""}
        </AppText>
        <UsDateField
          label={c.assign.end}
          value={end}
          onChange={(v) => {
            setEnd(v);
            setEndError(false);
          }}
          error={endError ? c.assign.errorEnd : null}
        />
        {parseUsDate(end) && parseUsDate(end) !== "invalid" ? (
          <AppText
            size={sample.noteSize}
            color={colors.secondary}
            center
            style={{ marginBottom: 4 }}
          >
            {c.assign.removeBody(day(parseUsDate(end) as string))}
          </AppText>
        ) : null}
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton
              label={strings.common.cancel}
              variant="outline"
              onPress={() => setRemoving(null)}
            />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={c.assign.confirmRemove}
              onPress={() => void remove()}
              disabled={busy}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  marginHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  bar: { height: 8, borderRadius: 4, overflow: "hidden" },
  sheetButtons: { flexDirection: "row", gap: 8, marginTop: 12 },
  flex: { flex: 1 },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
