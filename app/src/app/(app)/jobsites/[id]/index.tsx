import { AddressReviewNote } from "@/components/AddressFields";
import { useAddressStrings } from "@/i18n/useAddressStrings";
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { CardBlock } from "@/components/bento/Card";
import { AppAlert } from "@/components/AppAlert";
import { AppButton } from "@/components/AppButton";
import { AppField } from "@/components/AppField";
import { AppText } from "@/components/AppText";
import { Chip } from "@/components/Chip";
import { DataRow } from "@/components/DataRow";
import { Icon } from "@/components/Icon";
import { ListRow } from "@/components/ListRow";
import { WORK_KEYS } from "@/components/work/ScheduleWorkPanel";
import { saveLocation } from "@/lib/jobsiteLocation";
import { Sheet } from "@/components/Sheet";
import { BackHeader } from "@/components/bento/Header";
import {
  AddressRow,
  DetailTabs,
  InfoRow,
  JobsiteHistory,
  JobsiteLibrary,
  MonthCard,
  QuickActions,
} from "@/components/clients/JobsiteParts";
import { TerminatedPanel } from "@/components/clients/TerminatedPanel";
import { JobsiteExtras } from "@/components/quotes/JobsiteExtras";
import { ContractCard } from "@/components/contract/ContractCard";
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
  mapsUrl,
  money,
  parseMoney,
  paySummary,
  readableFrequency,
  sameContact,
  statusChangeNeedsConfirm,
  statusMenuActions,
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
  fetchJobsite,
  fetchJobsiteStaff,
  fetchMargin,
  fetchPay,
  fetchRate,
  setJobsiteRate,
  setJobsiteStatus,
  uploadJobsiteDocument,
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
import { formatPhone, phoneDigits } from "@/lib/phone";
import { plusCodeToCoordinates } from "@/lib/plusCode";
import { usePermissions, useSession } from "@/lib/session";
import { iconStrokeWidth, sample, useTheme } from "@/theme";

type Tab = "summary" | "documents" | "history" | "staff"; // D-343: "staff" se abre con el botón rápido, no es pestaña

/**
 * Detalle del jobsite (orden 150, D-339, D-340, muestra surveys/jobsite-detalle-aprobado.html pantalla 1): encabezado
 * con atrás, "Editar" y el menú ⋯ (Pausar / Reanudar / Terminar, la misma lógica del selector de estado de antes, D-056);
 * nombre, "Cliente: X" con la ficha de proveedor de cuentas (D-291) y el estado como etiqueta; botones rápidos Llamar,
 * Correo (plantillas del cliente), Maps y Schedule; pestañas Resumen / Documentos / Historial. El horario y el personal
 * del jobsite se conservan SIN cambios, con los mismos componentes, al final del Resumen (D-340).
 */
export default function JobsiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const [jobsite, setJobsite] = useState<Jobsite | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [margin, setMargin] = useState<Margin | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<JobsiteStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const day = (key: string) =>
    formatDate(dateFromKey(key).toISOString(), locale);
  const menuActions = jobsite && canChangeStatus(access) ? statusMenuActions(jobsite.status) : [];
  const actionLabel = (s: JobsiteStatus) =>
    s === "terminated" ? c.detail.terminate : s === "paused" ? c.detail.pause : c.detail.resume;

  async function applyStatus(next: JobsiteStatus) {
    if (!jobsite) return;
    setBusy(true);
    setStatusError(false);
    const r = await setJobsiteStatus(jobsite.id, next);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) setStatusError(true);
    await load();
  }

  const phone = jobsite?.contactPhone ? phoneDigits(jobsite.contactPhone) : "";
  const coords = jobsite?.plusCode ? plusCodeToCoordinates(jobsite.plusCode) : null;
  const maps = jobsite ? mapsUrl(jobsite.address, coords) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={goBack}
        backLabel={strings.common.back}
        action={
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
        extra={
          menuActions.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.detail.menu}
              onPress={() => setMenuOpen(true)}
              style={[styles.menuButton, { backgroundColor: colors.card }]}
            >
              <Icon name="dots" size={22} strokeWidth={iconStrokeWidth} color={colors.text} />
            </Pressable>
          ) : undefined
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
            {/* Encabezado (D-340): nombre, cliente con la ficha de proveedor (sin su participación, D-291) y estado. */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText weight="heavy" size={24} accessibilityRole="header">
                  {jobsite.name}
                </AppText>
                <View style={styles.clientLine}>
                  <AppText size={13} color={colors.secondary}>
                    {c.detail.clientLine(jobsite.clientName)}
                  </AppText>
                  {jobsite.clientAccountProvider ? <Chip label={c.accountProvider} /> : null}
                </View>
              </View>
              <Chip
                label={atRisk ? c.atRisk : c.status[jobsite.status]}
                tone={atRisk ? "warning" : statusTone(jobsite.status)}
                medium
              />
            </View>
            {statusError ? (
              <AppAlert tone="error" text={c.jobsite.errorStatus} />
            ) : null}
            {/* Orden 151 (D-340 (2)): terminado con aviso, resumen y "Reactivar jobsite". */}
            {jobsite.status === "terminated" ? (
              <TerminatedPanel jobsite={jobsite} c={c} onReactivated={load} />
            ) : (
            <QuickActions
              actions={[
                {
                  key: "call",
                  icon: "phone",
                  label: c.detail.call,
                  onPress: phone ? () => void Linking.openURL(`tel:${phone}`) : undefined,
                },
                {
                  key: "email",
                  icon: "mail",
                  label: c.detail.email,
                  // Mismo flujo de plantillas del cliente (D-323, D-335).
                  onPress: () =>
                    router.push({ pathname: "/send-email", params: { kind: "client", id: jobsite.clientId } }),
                },
                {
                  key: "maps",
                  icon: "map-pin",
                  label: c.detail.maps,
                  onPress: maps ? () => void Linking.openURL(maps) : undefined,
                },
                {
                  key: "staff",
                  icon: "users",
                  label: c.detail.scheduleTitle,
                  onPress: () => setTab("staff"),
                },
                {
                  key: "schedule",
                  icon: "calendar",
                  label: c.detail.schedule,
                  // Schedule no tiene filtro por jobsite: abre el Schedule actual (D-340).
                  onPress: seesSchedule ? () => router.navigate("/schedule") : undefined,
                },
              ]}
            />
            )}
            <DetailTabs<Tab>
              tabs={[
                { value: "summary", label: c.detail.tabSummary },
                { value: "documents", label: c.detail.tabDocuments },
                { value: "history", label: c.detail.tabHistory },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === "summary" ? (
              <Summary
                jobsite={jobsite}
                c={c}
                rate={rate}
                margin={margin}
                day={day}
                mapsLink={maps}
                seesSchedule={seesSchedule}
                onChanged={load}
              />
            ) : null}
            {tab === "documents" ? <Documents jobsite={jobsite} c={c} /> : null}
            {tab === "history" ? <JobsiteHistory jobsiteId={jobsite.id} c={c} /> : null}
            {tab === "staff" ? (
              <View style={{ marginTop: 12 }}>
                <AppText weight="bold" size={15} style={{ marginBottom: 8 }}>
                  {c.detail.scheduleTitle}
                </AppText>
                <Staff jobsite={jobsite} c={c} day={day} onChanged={load} />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Menú ⋯: Pausar / Reanudar / Terminar con la lógica del selector de antes (D-056, D-210). */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        {menuActions.map((s, i) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              if (jobsite && statusChangeNeedsConfirm(jobsite.status, s)) setConfirm(s);
              else void applyStatus(s);
            }}
            style={[
              styles.option,
              { borderBottomColor: colors.border, borderBottomWidth: i === menuActions.length - 1 ? 0 : 0.5 },
            ]}
          >
            <AppText weight="medium">{actionLabel(s)}</AppText>
          </Pressable>
        ))}
      </Sheet>
      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {jobsite
            ? confirm === "terminated"
              ? c.jobsite.terminateTitle(jobsite.name)
              : c.jobsite.pauseTitle(jobsite.name)
            : ""}
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
  mapsLink,
  seesSchedule,
  onChanged,
}: {
  jobsite: Jobsite;
  c: ClientsStrings;
  rate: number | null;
  margin: Margin | null;
  day: (key: string) => string;
  mapsLink: string | null;
  seesSchedule: boolean;
  onChanged: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const addressT = useAddressStrings();
  const router = useRouter();
  const [rateOpen, setRateOpen] = useState(false);
  const [rateText, setRateText] = useState("");
  const [rateError, setRateError] = useState(false);
  const [busy, setBusy] = useState(false);
  const none = c.jobsite.none;
  const rateEditable =
    isDirectJobsite(jobsite) &&
    canCreateLegacy(access) &&
    jobsite.status !== "terminated";
  const freq = readableFrequency(jobsite.frequency, {
    daily: c.form.daily,
    other: c.form.other,
    days: c.form.days,
    daysLong: c.detail.daysLong,
    and: c.form.and,
    everyDay: c.detail.everyDay,
    daysAWeek: c.detail.daysAWeek,
    except: c.detail.except,
    or: c.detail.or,
  });
  const freqDetail = [
    jobsite.estHoursPerVisit !== null ? c.detail.hoursPerVisit(String(jobsite.estHoursPerVisit)) : null,
    jobsite.startDate ? c.detail.since(day(jobsite.startDate)) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Jobsites guardados antes del hito 6: su ubicación sale del Plus Code al abrir su horario (D-200, como antes).
  useEffect(() => {
    if (seesSchedule && canAny(access, ["clientes_editar_datos"]) && jobsite.plusCode)
      void saveLocation(jobsite.id, jobsite.plusCode);
    // Solo al abrir el jobsite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsite.id]);

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

  const person = (name: string | null, phone: string | null, extra: (string | null)[] = []) =>
    [name, formatPhone(phone), ...extra].filter((x) => x && x.trim() !== "").join(" · ");
  const main = person(jobsite.contactName, jobsite.contactPhone);
  const emergency = person(jobsite.emergencyName, jobsite.emergencyPhone, [jobsite.emergencyRelation]);
  const oneContact = sameContact(jobsite);
  const hasEmergency = Boolean(jobsite.emergencyName?.trim() || jobsite.emergencyPhone?.trim());

  return (
    <View>
      {/* Tarjeta del mes (D-340); las cifras de pagos solo con permiso, igual que antes. */}
      {canSeeRate(access) && jobsite.status !== "terminated" ? <MonthCard jobsiteId={jobsite.id} rate={rate} margin={margin} c={c} /> : null}

      {/* Tarifa con lápiz para un cliente previo o proveedor (D-210). */}
      {rateEditable && rate !== null ? (
        <CardBlock style={{ marginBottom: 12 }}>
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
            last
          />
        </CardBlock>
      ) : null}
      {/* D-301: dirección vieja sin separar. */}
      {jobsite.addressNeedsReview ? (
        <AddressReviewNote
          t={addressT}
          onEdit={
            canEditClientData(access) && jobsite.status !== "terminated"
              ? () => router.push({ pathname: "/jobsites/[id]/edit", params: { id: jobsite.id } })
              : undefined
          }
        />
      ) : null}
      <CardBlock>
        <AddressRow address={jobsite.address} plusCode={jobsite.plusCode} mapsUrl={mapsLink} c={c} />
        {oneContact ? (
          <InfoRow title={main || c.detail.noContact} detail={hasEmergency ? c.detail.contactBoth : c.detail.contactMain} />
        ) : (
          <>
            <InfoRow title={main || none} detail={c.detail.contactMain} />
            <InfoRow title={emergency || none} detail={c.detail.contactEmergency} />
          </>
        )}
        <InfoRow
          title={freq ?? c.detail.noFrequency}
          detail={freqDetail || undefined}
          last={!jobsite.walkthroughVersion}
        />
        {/* Sin walkthrough no sale la fila (D-340). */}
        {jobsite.walkthroughVersion ? (
          <InfoRow
            title={c.jobsite.walkthrough}
            detail={c.jobsite.walkthroughVersion(jobsite.walkthroughVersion)}
            last
          />
        ) : null}
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

      {/* D-289: contrato del cliente, como "Contrato · estado" con Descargar (D-340). */}
      <ContractCard jobsiteId={jobsite.id} heading={c.detail.contract} downloadLabel={c.detail.download} />
      {/* D-238: quotes de extra en la fila "Extras" con "+ Quote de extra" (D-340). */}
      <JobsiteExtras
        jobsiteId={jobsite.id}
        terminated={jobsite.status === "terminated"}
        labels={{ title: c.detail.extras, empty: c.detail.noExtras, add: c.detail.extraQuote }}
      />

      {/* D-343: el personal se abre con el botón rápido "Staff"; ya no va en el Resumen. */}

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
}: {
  jobsite: Jobsite;
  c: ClientsStrings;
}) {
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocKind>("contract");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [error, setError] = useState<"title" | "upload" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const kinds = uploadableKinds(access);


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
    setReload((n) => n + 1);
  }

  return (
    <View>
      {/* Orden 150 (D-340): los documentos del jobsite y de su cliente, con abrir y descargar. */}
      <JobsiteLibrary jobsiteId={jobsite.id} c={c} reloadKey={reload} />
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
  menuButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  clientLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  sheetButtons: { flexDirection: "row", gap: 8, marginTop: 12 },
  flex: { flex: 1 },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
