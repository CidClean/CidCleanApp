import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { AccountButton } from '@/components/AccountButton';
import { Icon, type IconName } from '@/components/Icon';
import { Bento, Card, CardBlock, useCardText } from '@/components/bento/Card';
import { ApproveIcon, CalendarIcon, QuoteDueIcon, WalkthroughIcon } from '@/components/illustrations';
import { SlideToMark } from '@/components/SlideToMark';
import { WeekStrip } from '@/components/WeekStrip';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import type { SalesStrings } from '@/i18n/sales';
import { useStrings } from '@/i18n/useStrings';
import { showsSalesPending, sortPending } from '@/lib/leadRules';
import { fetchLeadsFollowup, type LeadsFollowupCounts } from '@/lib/leadsApi';
import { fetchHomeActivity, fetchQuotePending, type HomeActivity, type QuotePending } from '@/lib/quotesApi';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { canDoWalkthroughs, inProgress, type WalkthroughDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs } from '@/lib/walkthroughStore';
import { usePermissions, useSession } from '@/lib/session';
import { canAny, homeKind, homeShortcuts, type ShortcutKey } from '@/lib/visibility';
import { fetchEmployees } from '@/lib/employeesApi';
import { fetchUnreadCount } from '@/lib/notificationsApi';
import { formatTime } from '@/lib/week';
import { ClockCard } from '@/components/work/ClockCard';
import { ServiceDayCard } from '@/components/work/ServiceDayCard';
import { OfferCards } from '@/components/ica/OfferCard';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { fetchMyServiceDays, type MyServiceDays } from '@/lib/serviceDays';
import { ListRow } from '@/components/ListRow';
import { Segmented } from '@/components/Segmented';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dayKey } from '@/lib/leadRules';
import { clockIn, clockOut, fetchMySchedule, fetchWorkPending, type MyVisit, type WorkPending } from '@/lib/scheduleApi';
import { pickNext, pickToday, weekRange } from '@/lib/scheduleRules';
import { syncWorkQueue } from '@/lib/workQueue';
import { hoursText, money, monthKeyOf, monthStart } from '@/lib/accountingRules';
import { Pill } from '@/components/bento/Pill';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStatisticsStrings } from '@/i18n/useStatisticsStrings';
import { fetchAdminHome } from '@/lib/statisticsApi';
import { costShare, homeCards, type AdminHomeData, type HomeVisit, type HomeVisitStaff } from '@/lib/statisticsRules';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Inicio: el del admin para el Super Admin y quien tenga algún permiso; el del staff para quien no tenga ninguno (D-169). */
export default function HomeScreen() {
  const { access } = usePermissions();
  return homeKind(access) === 'admin' ? <AdminHome /> : <StaffHome />;
}

/**
 * Inicio unido (D-337, muestra surveys/navegacion-aprobado.html (1); une Inicio y Menú): saludo con la campana de
 * notificaciones (punto si hay sin leer) y el avatar de Mi cuenta; tres cifras tocables de lo que toca hoy (leads por
 * escribir → Leads/Hoy, por cobrar del mes → Accounting, visitas por aprobar → Por aprobar), cada una solo con su
 * permiso; la tarjeta de profit del mes (D-253); los avisos que piden acción (la visita propia de hoy, las visitas de
 * hoy, horas de la semana, GPS y entradas, Sin respuesta · decide, quotes por vencer y walkthroughs en curso); los
 * accesos que estaban en el Menú y la fila "Actividad" con el último hecho y su nombre real (reemplaza la tarjeta
 * "Quote accepted: null"). Las tarjetas de Pipeline, Cuentas, Esperando respuesta y Seguimientos se quitaron: viven
 * en Leads y Accounts (D-200).
 */
function AdminHome() {
  const { colors, status } = useTheme();
  const { profile } = useSession();
  const strings = useStrings();
  const s = useSalesStrings();
  const router = useRouter();
  const { access } = usePermissions();
  // D-333 (4): Hoy te toca escribir y Sin respuesta · decide (con leads_ver).
  const [flow, setFlow] = useState<LeadsFollowupCounts | null>(null);
  const salesVisible = showsSalesPending(access);
  // Hito 4 (D-131): quotes por vencer (Urgente). Las decisiones del cliente pasan a la fila Actividad (D-337).
  const q = useQuoteStrings();
  const [quotes, setQuotes] = useState<QuotePending[]>([]);
  const [activity, setActivity] = useState<HomeActivity | null>(null);
  const quotesVisible = access.isSuperAdmin || ['quotes_ver', 'quotes_editar', 'quotes_enviar'].some((k) => access.permissions.has(k));

  useFocusEffect(
    useCallback(() => {
      if (!salesVisible && !quotesVisible) return;
      let cancelled = false;
      if (quotesVisible) {
        void fetchQuotePending().then((rows) => !cancelled && setQuotes(rows));
        void fetchHomeActivity().then((row) => !cancelled && setActivity(row));
      }
      if (salesVisible) {
        void fetchLeadsFollowup().then((result) => {
          if (!cancelled && result.ok) setFlow(result.data);
        });
      }
      return () => {
        cancelled = true;
      };
    }, [salesVisible, quotesVisible]),
  );

  // D-212: "Walkthroughs en curso", armada con lo guardado en el teléfono (sirve sin internet).
  const wt = useWalkthroughStrings();
  const [local, setLocal] = useState<WalkthroughDoc[]>([]);
  const walkthroughsVisible = canDoWalkthroughs(access);
  useFocusEffect(
    useCallback(() => {
      if (!walkthroughsVisible) return;
      let cancelled = false;
      void listWalkthroughs().then((all) => {
        if (!cancelled) setLocal(inProgress(all));
      });
      return () => {
        cancelled = true;
      };
    }, [walkthroughsVisible]),
  );
  const ongoing = walkthroughsVisible ? local : [];

  const expiring = sortPending(
    quotes
      .filter((r) => r.kind === 'expiring')
      .map((r) => ({
        key: `quote-${r.kind}-${r.versionId}`,
        title: q.home[r.kind](r.company),
        detail: q.home.detail(r.site),
        urgent: true,
        leadId: r.leadId ?? undefined,
        jobsiteId: r.jobsiteId ?? undefined,
      })),
  );
  // Hito 6: GPS fuera de rango, entradas sin marcar a los 30 min y turnos abiertos (D-214).
  const t = useWorkStrings();
  const st = useStatisticsStrings();
  const a = useAccountingStrings();
  const seesWork = canAny(access, ['work_aprobar', 'work_editar', 'work_revisar_gps', 'work_registrar_por_otros', 'schedule_ver_editar']);
  const [work, setWork] = useState<WorkPending | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!seesWork) return;
      let cancelled = false;
      void fetchWorkPending().then((r) => !cancelled && r.ok && setWork(r.data));
      return () => {
        cancelled = true;
      };
    }, [seesWork]),
  );
  // Quien también trabaja en sitios (un supervisor) marca su entrada desde aquí.
  const mine = useMySchedule(true);
  const myToday = pickToday(mine.visits, new Date());
  const workCards = work
    ? ([
        work.gpsOut > 0 ? { key: 'gps', text: t.homeGps(work.gpsOut), tab: 'approve' } : null,
        work.forgotClockIn > 0 ? { key: 'forgot', text: t.homeForgot(work.forgotClockIn), tab: 'schedule' } : null,
        work.openShifts > 0 ? { key: 'open', text: t.homeOpen(work.openShifts), tab: 'approve' } : null,
      ].filter(Boolean) as { key: string; text: string; tab: string }[])
    : [];
  // D-253: las tarjetas salen de admin_home, cada una con su permiso (sin permiso llega null).
  const cards = homeCards(access);
  const [home, setHome] = useState<AdminHomeData | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchAdminHome().then((r) => !cancelled && r.ok && setHome(r.data));
      return () => {
        cancelled = true;
      };
    }, []),
  );
  // Accesos del Inicio (D-337): Employees lleva "N activos".
  const shortcuts = homeShortcuts(access);
  const seesEmployees = shortcuts.includes('employees');
  const [activeEmployees, setActiveEmployees] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!seesEmployees) return;
      let cancelled = false;
      void fetchEmployees().then((r) => {
        if (!cancelled && r.ok) setActiveEmployees(r.data.filter((e) => e.active).length);
      });
      return () => {
        cancelled = true;
      };
    }, [seesEmployees]),
  );

  // Tres cifras de lo que toca hoy, cada una solo con su permiso.
  const figures: Figure[] = [];
  if (salesVisible && flow)
    figures.push({ key: 'write', tone: 'plain', value: String(flow.toWrite), label: strings.hub.toWrite(flow.toWrite), onPress: () => router.navigate({ pathname: '/pipeline', params: { tab: 'today' } }) });
  if (cards.receivable && home?.receivable) {
    const r = home.receivable;
    const key = r.month.slice(0, 7);
    const month = (a.months[Number(r.month.slice(5, 7)) - 1] ?? '').slice(0, 3);
    figures.push({
      key: 'collect',
      tone: 'attention',
      value: money(r.pending),
      label: strings.hub.toCollect(month),
      onPress: () => router.push({ pathname: '/accounting/income', params: { from: key, to: key } }),
    });
  }
  if (cards.toApprove && home?.toApprove) {
    const n = home.toApprove.visits; // D-299: visitas, no turnos
    figures.push({ key: 'approve', tone: 'brand', value: String(n), label: strings.hub.toApprove(n), onPress: () => router.navigate({ pathname: '/schedule', params: { tab: 'approve' } }) });
  }

  const noResponse = salesVisible && flow ? flow.noResponse : 0;
  const nothing = expiring.length === 0 && ongoing.length === 0 && workCards.length === 0 && !myToday && noResponse === 0 && (home?.toApprove?.visits ?? 0) === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Greeting name={profile?.fullName ?? ''} />
        {figures.length > 0 ? <FigureRow figures={figures} /> : null}
        <Bento>
          {cards.profit && home?.month ? <ProfitCard m={home.month} /> : null}
          {myToday ? <TodayWorkCard visit={myToday} onChanged={mine.reload} /> : null}
          {cards.today && home?.today ? home.today.map((v) => <TodayVisitCard key={v.id} v={v} />) : null}
          {cards.weekHours && home?.weekHours && home.weekHours.length > 0 ? <WeekHoursCard rows={home.weekHours} /> : null}
          {workCards.map((c) => (
            <Card
              key={c.key}
              tone="attention"
              accessibilityLabel={c.text}
              onPress={() => router.navigate({ pathname: '/schedule', params: { tab: c.tab } })}
              style={{ gap: 10 }}
            >
              <QuoteDueIcon />
              <AppText weight="bold" size={15}>
                {c.text}
              </AppText>
            </Card>
          ))}
          {noResponse > 0 ? (
            <Card
              tone="attention"
              accessibilityLabel={`${s.flow.homeNoResponse}: ${noResponse}`}
              onPress={() => router.navigate({ pathname: '/pipeline', params: { tab: 'today' } })}
              style={{ gap: 10 }}
            >
              <QuoteDueIcon />
              <AppText weight="bold" size={15}>
                {`${s.flow.homeNoResponse}: ${noResponse}`}
              </AppText>
              <AppText size={12} color={colors.attentionText}>
                {s.flow.homeNoResponseDetail}
              </AppText>
            </Card>
          ) : null}
          {expiring.map((row) => (
            <Card
              key={row.key}
              tone="attention"
              accessibilityLabel={row.title}
              onPress={() =>
                row.leadId
                  ? router.push({ pathname: '/leads/[id]', params: { id: row.leadId } })
                  : row.jobsiteId
                    ? router.push({ pathname: '/jobsites/[id]', params: { id: row.jobsiteId } })
                    : router.navigate('/pipeline')
              }
              style={{ gap: 10 }}
            >
              <QuoteDueIcon />
              <AppText weight="bold" size={15}>
                {row.title}
              </AppText>
              {row.detail ? (
                <AppText size={12} color={colors.attentionText}>
                  {`${s.home.urgent} · ${row.detail}`}
                </AppText>
              ) : null}
            </Card>
          ))}
          {ongoing.length > 0 ? (
            <Card
              wide
              accessibilityLabel={wt.home.row}
              style={styles.rowCard}
              onPress={() =>
                ongoing.length === 1
                  ? router.push({ pathname: '/walkthrough/[id]', params: { id: ongoing[0].id } })
                  : router.push('/walkthrough')
              }
            >
              <WalkthroughIcon />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size={15}>
                  {ongoing.length === 1 ? strings.home.walkthroughOngoing : wt.home.row}
                </AppText>
                <AppText size={12} color={colors.secondary}>
                  {ongoing.length === 1 ? strings.home.walkthroughStep(ongoing[0].company, ongoing[0].step) : wt.home.count(ongoing.length)}
                </AppText>
              </View>
              <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.secondary} />
            </Card>
          ) : null}
          {nothing ? (
            <Card wide style={styles.empty}>
              <Icon name="circle-check" size={24} strokeWidth={iconStrokeWidth} color={status.success} />
              <AppText weight="bold">{strings.home.caughtUp}</AppText>
              <AppText size={sample.noteSize} color={colors.secondary}>
                {strings.home.nothingToReview}
              </AppText>
            </Card>
          ) : null}
        </Bento>
        {shortcuts.length > 0 ? <Shortcuts items={shortcuts} activeEmployees={activeEmployees} /> : null}
        {activity ? <ActivityRow activity={activity} /> : null}
      </ScrollView>
    </View>
  );
}

type Figure = { key: string; tone: 'plain' | 'attention' | 'brand'; value: string; label: string; onPress: () => void };

/** Fila de tres cifras tocables (D-337, muestra: blanca, ámbar y de marca). */
function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <View style={styles.figures}>
      {figures.map((f) => (
        <FigureTile key={f.key} f={f} />
      ))}
    </View>
  );
}

function FigureTile({ f }: { f: Figure }) {
  const tx = useCardText(f.tone);
  const { colors, brand } = useTheme();
  const bg = f.tone === 'brand' ? brand : f.tone === 'attention' ? colors.attention : colors.card;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${f.value} ${f.label}`} onPress={f.onPress} style={[styles.figure, { backgroundColor: bg }]}>
      <AppText weight="heavy" size={20} color={f.tone === 'attention' ? colors.attentionText : tx.main} numberOfLines={1} adjustsFontSizeToFit>
        {f.value}
      </AppText>
      <AppText size={11} color={tx.soft} style={{ opacity: tx.softOpacity, lineHeight: 14 }}>
        {f.label}
      </AppText>
    </Pressable>
  );
}

const SHORTCUT_ICONS: Record<ShortcutKey, IconName> = {
  schedule: 'calendar',
  employees: 'users',
  accounting: 'chart-bar',
  statistics: 'chart-line',
  documents: 'file-text',
  history: 'history',
};

const SHORTCUT_ROUTES = {
  schedule: '/schedule',
  employees: '/employees',
  accounting: '/accounting',
  statistics: '/statistics',
  documents: '/documents',
  history: '/history',
} as const;

/** Accesos del Inicio (D-337): rejilla de 3 columnas con icono y nombre; Employees lleva "N activos". */
function Shortcuts({ items, activeEmployees }: { items: ShortcutKey[]; activeEmployees: number | null }) {
  const router = useRouter();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const label = (k: ShortcutKey) =>
    k === 'schedule' ? strings.nav.schedule : k === 'history' ? strings.hub.history : strings.nav[k];
  return (
    <View style={styles.tiles}>
      {items.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={label(k)}
          onPress={() => (k === 'schedule' ? router.navigate(SHORTCUT_ROUTES[k]) : router.push(SHORTCUT_ROUTES[k]))}
          style={[styles.tile, { backgroundColor: colors.card }]}
        >
          <Icon name={SHORTCUT_ICONS[k]} size={22} strokeWidth={iconStrokeWidth} color={brand} />
          <AppText weight="bold" size={12} style={{ textAlign: 'center' }}>
            {label(k)}
          </AppText>
          {k === 'employees' && activeEmployees !== null ? (
            <AppText size={11} color={colors.secondary}>
              {strings.menu.activeEmployees(activeEmployees)}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Fila "Actividad" (D-337): el último hecho con su nombre real y la fecha; abre el lead o el jobsite. */
function ActivityRow({ activity }: { activity: HomeActivity }) {
  const router = useRouter();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { colors } = useTheme();
  const at = new Date(activity.at);
  const title = strings.hub.activityLine[activity.kind](activity.name);
  const detail = [`${(a.months[at.getMonth()] ?? '').slice(0, 3)} ${at.getDate()}`, activity.site].filter(Boolean).join(' · ');
  return (
    <View style={{ marginTop: 12 }}>
      <AppText size={13} color={colors.secondary} style={{ marginBottom: 6 }}>
        {strings.hub.activity}
      </AppText>
      <CardBlock>
        <ListRow
          title={title}
          detail={detail}
          chevron
          last
          onPress={() =>
            activity.leadId
              ? router.push({ pathname: '/leads/[id]', params: { id: activity.leadId } })
              : activity.jobsiteId
                ? router.push({ pathname: '/jobsites/[id]', params: { id: activity.jobsiteId } })
                : router.navigate('/pipeline')
          }
        />
      </CardBlock>
    </View>
  );
}

/** Tarjeta de marca (D-253): profit del mes sobre lo esperado, ingreso · personal · gastos, barra de lo que se va en costos y margen. */
function ProfitCard({ m }: { m: NonNullable<AdminHomeData['month']> }) {
  const st = useStatisticsStrings();
  const a = useAccountingStrings();
  const month = a.months[Number(m.month.slice(5, 7)) - 1] ?? '';
  const share = costShare(m);
  return (
    <Card tone="brand" wide style={{ padding: 18, gap: 4 }}>
      <AppText size={13} color="#FFFFFF" style={{ opacity: 0.82 }}>
        {st.home.profitOf(month)}
      </AppText>
      <AppText weight="heavy" size={32} color="#FFFFFF">
        {money(m.profit)}
      </AppText>
      <AppText size={12} color="#FFFFFF" style={{ opacity: 0.82 }}>
        {st.home.profitLine(money(m.expected), money(m.staff), money(m.expenses))}
      </AppText>
      <View style={styles.bar} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}>
        <View style={[styles.barFill, { width: `${share * 100}%` }]} />
      </View>
      {m.margin !== null ? (
        <AppText size={12} color="#FFFFFF" style={{ opacity: 0.82, marginTop: 2 }}>
          {st.home.margin(String(Math.round(m.margin * 10) / 10))}
        </AppText>
      ) : null}
    </Card>
  );
}

/** Una visita de hoy (D-253): hora, programados y quién marcó entrada. */
function TodayVisitCard({ v }: { v: HomeVisit }) {
  const sd = useServiceDaysStrings();
  // D-275: los 1099 no marcan entrada; se muestra el estado de su día de servicio.
  const dayLabel = (s: HomeVisitStaff['serviceDay']) =>
    s === 'approved' ? sd.approved : s === 'needs_correction' ? sd.needsCorrection : s === 'pending' ? sd.pending : sd.notMarked;
  const router = useRouter();
  const { colors } = useTheme();
  const st = useStatisticsStrings();
  const { access } = usePermissions();
  // La visita se abre con el schedule (su pantalla lo exige).
  const open = canAny(access, ['schedule_ver_editar']) ? () => router.push({ pathname: '/schedule/visit/[id]', params: { id: v.id } }) : undefined;
  return (
    <Card wide onPress={open} accessibilityLabel={`${st.home.today(formatTime(new Date(v.startsAt)))} · ${v.jobsite}`}>
      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" size={15}>
            {st.home.today(formatTime(new Date(v.startsAt)))}
          </AppText>
          <AppText size={12} color={colors.secondary}>
            {v.jobsite}
          </AppText>
        </View>
        <Pill tone="ok" label={st.home.scheduledChip(v.staff.length)} />
      </View>
      {v.staff.map((p) => (
        <View key={p.profileId} style={[styles.krow, { borderTopColor: colors.border }]}>
          <AppText size={13} style={{ flex: 1 }}>
            {p.name}
          </AppText>
          {p.contractor ? (
            <Pill tone={p.serviceDay === 'approved' ? 'ok' : 'warn'} label={dayLabel(p.serviceDay)} />
          ) : p.clockIn ? (
            <Pill tone="ok" label={p.clockOut ? st.home.clockedOut(formatTime(new Date(p.clockOut))) : st.home.clockedIn(formatTime(new Date(p.clockIn)))} />
          ) : (
            <Pill tone="warn" label={st.home.noClockIn} />
          )}
        </View>
      ))}
    </Card>
  );
}

/** Horas de esta semana contra el tope de 32 h (D-253): solo admin con el schedule (D-223). Reales / programadas. */
function WeekHoursCard({ rows }: { rows: NonNullable<AdminHomeData['weekHours']> }) {
  const { colors } = useTheme();
  const st = useStatisticsStrings();
  return (
    <Card tone="dark" wide>
      <AppText size={12} color={colors.darkCardText} style={{ opacity: 0.72 }}>
        {st.home.weekHours}
      </AppText>
      {rows.map((r) => (
        <View key={r.profileId} style={[styles.krow, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
          <AppText size={13} color={colors.darkCardText} style={{ flex: 1 }}>
            {r.name}
          </AppText>
          <AppText size={13} weight="bold" color={colors.darkCardText}>
            {st.home.weekRow(hoursText(r.workedMinutes), hoursText(r.programmedMinutes))}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

/**
 * Saludo del estilo C (D-223): fecha de hoy en 13px gris cálido y "Hola, {nombre}" en 24px/800; a la derecha (D-337)
 * la campana de notificaciones (cuadro blanco con punto si hay sin leer) y el avatar que abre Mi cuenta.
 */
function Greeting({ name }: { name: string }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const router = useRouter();
  // Área segura de arriba: el saludo no queda bajo la barra de estado del teléfono.
  const insets = useSafeAreaInsets();
  const first = name.trim().split(/\s+/)[0] ?? '';
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchUnreadCount().then((n) => !cancelled && setUnread(n ?? 0));
      return () => {
        cancelled = true;
      };
    }, []),
  );
  return (
    <View style={[styles.greeting, { paddingTop: insets.top + 20 }]}>
      <View style={{ gap: 2, flex: 1 }}>
        <AppText size={13} color={colors.secondary}>
          {strings.home.dateLine(new Date())}
        </AppText>
        <AppText weight="heavy" size={24} accessibilityRole="header">
          {first ? strings.home.greeting(first) : strings.nav.home}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.hub.notifications(unread)}
        onPress={() => router.push('/notifications')}
        style={[styles.bell, { backgroundColor: colors.card }]}
      >
        <Icon name="bell" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
        {unread > 0 ? <View style={styles.bellDot} /> : null}
      </Pressable>
      <AccountButton />
    </View>
  );
}

/**
 * Inicio del staff (D-165, D-214, D-223): la visita de hoy con "Desliza para marcar entrada" y el turno (ClockCard),
 * la próxima visita y "Tu semana" con Esta semana / Próxima semana (D-093); tocar un día muestra sus visitas.
 * Regla del dueño (D-223): el staff nunca ve sus horas contra el tope de 32 h; aquí no hay nada de eso. Abajo, la fila
 * Mis horas (D-274).
 */
function StaffHome() {
  const { profile } = useSession();
  const router = useRouter();
  const strings = useStrings();
  const sd = useServiceDaysStrings();
  const contractor = profile?.workerType === '1099';
  const { visits, reload } = useMySchedule(true);
  const days = useMyMonthDays(contractor);
  return (
    <View style={{ flex: 1, backgroundColor: useTheme().colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Greeting name={profile?.fullName ?? ''} />
        {/* D-292: ofertas de trabajo pendientes del 1099 (surveys/ica-ofertas-aprobado.html (3)). */}
        {contractor ? <OfferCards onChanged={reload} /> : null}
        <StaffCards visits={visits} onChanged={() => { reload(); days.reload(); }} contractor={contractor} />
        {/* D-279, D-286 (1): el 1099 ve "Mis días de servicio" con el resumen del mes; el W-2, Mis horas (D-274). */}
        <CardBlock style={{ marginTop: 12 }}>
          {contractor ? (
            <ListRow
              title={sd.title}
              detail={days.data ? sd.summary(sd.months[new Date().getMonth()] ?? '', days.data.approved, days.data.pending + days.data.needsCorrection) : sd.rowDetail}
              chevron
              last
              onPress={() => router.push('/my-service-days')}
            />
          ) : (
            <ListRow title={strings.myHours.title} detail={strings.myHours.rowDetail} chevron last onPress={() => router.push('/my-hours')} />
          )}
        </CardBlock>
      </ScrollView>
    </View>
  );
}

/** Resumen del mes del 1099 para la fila "Mis días de servicio" (D-286 (1)). */
function useMyMonthDays(enabled: boolean) {
  const [data, setData] = useState<MyServiceDays | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return;
    void fetchMyServiceDays(monthStart(monthKeyOf(new Date()))).then((r) => {
      if (r.ok) setData(r.data);
    });
  }, [enabled]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { data, reload };
}

/** Hoy: el W-2 marca entrada y salida (ClockCard); el 1099 marca su día como completado (D-275). */
function TodayWorkCard({ visit, onChanged }: { visit: MyVisit; onChanged: () => void }) {
  const { profile } = useSession();
  return profile?.workerType === '1099' ? <ServiceDayCard visit={visit} onChanged={onChanged} /> : <ClockCard visit={visit} onChanged={onChanged} />;
}

/** Mis visitas (semana actual y siguiente) y la cola de entradas y salidas sin conexión, al volver a la pantalla. */
function useMySchedule(enabled: boolean) {
  const [visits, setVisits] = useState<MyVisit[]>([]);
  const reload = useCallback(() => {
    if (!enabled) return;
    void syncWorkQueue({ clockIn, clockOut }).finally(() =>
      fetchMySchedule().then((r) => {
        if (r.ok) setVisits(r.data);
      }),
    );
  }, [enabled]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { visits, reload };
}

function StaffCards({ visits, onChanged, weekCard = true, contractor = false }: { visits: MyVisit[]; onChanged: () => void; weekCard?: boolean; contractor?: boolean }) {
  const { colors } = useTheme();
  const sd = useServiceDaysStrings();
  const strings = useStrings();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const now = new Date();
  const [which, setWhich] = useState<'this' | 'next'>('this');
  const [selected, setSelected] = useState<string | null>(null);
  const today = pickToday(visits, now);
  const next = pickNext(visits, now);
  const range = weekRange(now, which);
  const inWeek = visits.filter((v) => v.day >= range.from && v.day <= range.to);
  const days = range.days.map((key, i) => ({
    key,
    label: strings.home.weekDays[i] ?? '',
    dayNumber: Number(key.slice(8)),
    hasVisit: inWeek.some((v) => v.day === key && v.scheduled),
    isToday: key === dayKey(now),
  }));
  const dayList = selected ? inWeek.filter((v) => v.day === selected) : [];
  return (
    <Bento>
      {today ? <TodayWorkCard visit={today} onChanged={onChanged} /> : null}
      {next ? (
        <Card tone="attention" wide style={styles.rowCard}>
          <CalendarIcon />
          <View style={{ gap: 2, flex: 1 }}>
            <AppText size={13} color={colors.attentionText}>
              {strings.home.next}
            </AppText>
            <AppText weight="bold" size={16}>
              {contractor
                ? `${s.dayNames[next.startsAt.getDay()]} ${next.startsAt.getDate()}`
                : `${s.dayNames[next.startsAt.getDay()]} ${next.startsAt.getDate()} · ${formatTime(next.startsAt)}`}
            </AppText>
            {/* D-275: al 1099 la franja se muestra como "Franja de acceso del cliente". */}
            {contractor ? (
              <AppText size={12} color={colors.secondary}>
                {sd.accessWindow(formatTime(next.startsAt), formatTime(new Date(next.startsAt.getTime() + next.minutes * 60000)))}
              </AppText>
            ) : null}
            <AppText size={12} color={colors.secondary}>
              {next.jobsite}
            </AppText>
          </View>
        </Card>
      ) : null}
      {weekCard ? (
        <Card wide style={{ gap: 12 }}>
          <AppText size={13} color={colors.secondary}>
            {strings.home.yourWeek}
          </AppText>
          <Segmented
            options={[
              { value: 'this', label: t.thisWeek },
              { value: 'next', label: t.nextWeek },
            ]}
            value={which}
            onChange={(v) => {
              setWhich(v);
              setSelected(null);
            }}
          />
          <WeekStrip days={days} selected={selected} onSelect={(k) => setSelected((cur) => (cur === k ? null : k))} />
          {selected ? (
            dayList.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noVisits}
              </AppText>
            ) : (
              dayList.map((v, i) => (
                <ListRow
                  key={v.id}
                  title={v.jobsite}
                  detail={(contractor ? sd.accessWindow : strings.home.timeRange)(
                    formatTime(v.startsAt),
                    formatTime(new Date(v.startsAt.getTime() + v.minutes * 60000)),
                  )}
                  last={i === dayList.length - 1}
                />
              ))
            )
          ) : null}
        </Card>
      ) : null}
    </Bento>
  );
}

const styles = StyleSheet.create({
  flowHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  flowSee: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  page: { paddingHorizontal: 16, paddingBottom: 16 },
  greeting: { paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bell: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // Punto de la muestra D-337 (#C2410C).
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#C2410C' },
  figures: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  figure: { flex: 1, borderRadius: 16, padding: 10, gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: { flexBasis: '30%', flexGrow: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  mainCard: { padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  // D-224 (C1): con ilustración la tarjeta mide 172px y el dibujo llega al borde derecho e inferior.
  mainCardArt: { height: 172, paddingRight: 0, paddingBottom: 0, alignItems: 'flex-end' },
  rowCard: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayCard: { padding: 0, gap: 0 },
  todayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, padding: 18 },
  todayHeadArt: { height: 150, paddingRight: 0, paddingBottom: 0 },
  slide: { marginHorizontal: 12, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  krow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  bar: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', borderRadius: 8, backgroundColor: '#FFFFFF' },
});
