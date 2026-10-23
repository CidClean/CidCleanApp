import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Bento, Card, useCardText } from '@/components/bento/Card';
import { ApproveIcon, CalendarIcon, CartArt, OfficeArt, QuoteDueIcon, WalkthroughIcon } from '@/components/illustrations';
import { SlideToMark } from '@/components/SlideToMark';
import { WeekStrip } from '@/components/WeekStrip';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { salesPendingRows, showsSalesPending, sortPending, type SalesPendingCounts } from '@/lib/leadRules';
import { fetchSalesPending } from '@/lib/leadsApi';
import { fetchQuotePending, type QuotePending } from '@/lib/quotesApi';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { canDoWalkthroughs, inProgress, type WalkthroughDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs } from '@/lib/walkthroughStore';
import { usePermissions, useSession } from '@/lib/session';
import { homeKind, showsMonthFigures } from '@/lib/visibility';
import { fetchWeekVisits, formatTime, pickNextVisit, pickTodayVisit, startOfWeekMonday, weekDays, type Visit } from '@/lib/week';
import { iconStrokeWidth, illustrations, sample, useTheme } from '@/theme';

/** Inicio: el del admin para el Super Admin y quien tenga algún permiso; el del staff para quien no tenga ninguno (D-169). */
export default function HomeScreen() {
  const { access } = usePermissions();
  return homeKind(access) === 'admin' ? <AdminHome /> : <StaffHome />;
}

/**
 * Inicio del admin (D-111, D-164, D-223 estilo C): saludo, tarjeta de marca con las cifras del mes, los pendientes
 * por urgencia en tarjetas (los urgentes en ámbar), las cifras de seguimientos y walkthroughs agendados y el
 * walkthrough en curso; sin pendientes, "Todo al día".
 */
function AdminHome() {
  const { colors, status } = useTheme();
  const { profile } = useSession();
  const strings = useStrings();
  const s = useSalesStrings();
  const router = useRouter();
  const { access } = usePermissions();
  const [sales, setSales] = useState<SalesPendingCounts | null>(null);
  const salesVisible = showsSalesPending(access);
  // Hito 4 (D-209, D-131): decisiones del cliente sin ver y quotes por vencer (Urgente).
  const q = useQuoteStrings();
  const [quotes, setQuotes] = useState<QuotePending[]>([]);
  const quotesVisible = access.isSuperAdmin || ['quotes_ver', 'quotes_editar', 'quotes_enviar'].some((k) => access.permissions.has(k));

  useFocusEffect(
    useCallback(() => {
      if (!salesVisible && !quotesVisible) return;
      let cancelled = false;
      if (quotesVisible) void fetchQuotePending().then((rows) => !cancelled && setQuotes(rows));
      if (salesVisible) {
        void fetchSalesPending().then((result) => {
          if (!cancelled && result.ok) setSales(result.data);
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

  const quoteRows = quotes.map((r) => ({
    key: `quote-${r.kind}-${r.versionId}`,
    title: q.home[r.kind](r.company),
    detail: q.home.detail(r.site),
    urgent: r.kind === 'expiring',
    leadId: r.leadId as string | undefined,
  }));
  const pending = sortPending([...quoteRows, ...salesPendingRows(access, sales, s)]);
  const salesRows = salesPendingRows(access, sales, s);
  const otherRows = sortPending(quoteRows);
  const followUps = salesRows.find((r) => r.key === 'followUps') ? (sales?.followUpsDue ?? 0) : 0;
  const scheduled = salesRows.find((r) => r.key === 'walkthroughs') ? (sales?.walkthroughsUpcoming ?? 0) : 0;
  const nothing = pending.length === 0 && ongoing.length === 0;
  const money0 = '$0'; // TEMPORAL: cifras en $0 hasta que Accounting tenga datos (hito 7)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Greeting name={profile?.fullName ?? ''} avatar />
        {/* D-223 (estilo C): mosaico de 2 columnas; D-111 y D-131: pendientes por urgencia, solo de las áreas con permiso. */}
        <Bento>
          {showsMonthFigures(access) ? (
            <Card tone="brand" wide style={[styles.mainCard, illustrations ? styles.mainCardArt : null]}>
              <View style={{ gap: 6, flexShrink: 1, paddingBottom: illustrations ? 18 : 0 }}>
                <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                  {strings.home.income}
                </AppText>
                <AppText weight="heavy" size={32} color="#FFFFFF">
                  {money0}
                </AppText>
                <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                  {strings.home.profitLine(money0)}
                </AppText>
              </View>
              <OfficeArt />
            </Card>
          ) : null}
          {otherRows.map((row) => (
            <Card
              key={row.key}
              tone={row.urgent ? 'attention' : 'plain'}
              accessibilityLabel={row.title}
              onPress={() =>
                'leadId' in row && row.leadId ? router.push({ pathname: '/leads/[id]', params: { id: row.leadId } }) : router.navigate('/pipeline')
              }
              style={{ gap: 10 }}
            >
              {row.urgent ? <QuoteDueIcon /> : <ApproveIcon />}
              <AppText weight="bold" size={15}>
                {row.title}
              </AppText>
              {row.detail ? (
                <AppText size={12} color={row.urgent ? colors.attentionText : colors.secondary}>
                  {row.urgent ? `${s.home.urgent} · ${row.detail}` : row.detail}
                </AppText>
              ) : null}
            </Card>
          ))}
          {followUps > 0 ? (
            <NumberCard tone="plain" label={strings.home.followUps} value={followUps} sub={strings.home.followUpsSub} onPress={() => router.navigate('/pipeline')} />
          ) : null}
          {scheduled > 0 ? (
            <NumberCard tone="dark" label={strings.home.walkthroughs} value={scheduled} sub={strings.home.walkthroughsSub} onPress={() => router.navigate('/pipeline')} />
          ) : null}
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
      </ScrollView>
    </View>
  );
}

/** Saludo del estilo C (D-223): fecha de hoy en 13px gris cálido, "Hola, {nombre}" en 24px/800 y, en el admin, iniciales. */
function Greeting({ name, avatar = false }: { name: string; avatar?: boolean }) {
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const first = name.trim().split(/\s+/)[0] ?? '';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={styles.greeting}>
      <View style={{ gap: 2, flex: 1 }}>
        <AppText size={13} color={colors.secondary}>
          {strings.home.dateLine(new Date())}
        </AppText>
        <AppText weight="heavy" size={24} accessibilityRole="header">
          {first ? strings.home.greeting(first) : strings.nav.home}
        </AppText>
      </View>
      {avatar && initials ? (
        <View style={[styles.avatar, { backgroundColor: brand }]}>
          <AppText weight="bold" color="#FFFFFF">
            {initials}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Tarjeta de cifra (D-223): etiqueta 13px, cifra 26px/800 y línea 12px. */
function NumberCard({ tone, label, value, sub, onPress }: { tone: 'plain' | 'dark'; label: string; value: number; sub: string; onPress: () => void }) {
  const t = useCardText(tone);
  return (
    <Card tone={tone} onPress={onPress} accessibilityLabel={`${label}: ${value} ${sub}`} style={{ gap: 6 }}>
      <AppText size={13} color={t.soft} style={{ opacity: t.softOpacity }}>
        {label}
      </AppText>
      <AppText weight="heavy" size={26} color={t.main}>
        {String(value)}
      </AppText>
      <AppText size={12} color={t.soft} style={{ opacity: t.softOpacity }}>
        {sub}
      </AppText>
    </Card>
  );
}

/** Inicio del staff (D-165, D-223 estilo C): visita de hoy (solo si hay) con "Desliza para marcar entrada", la próxima visita y la semana. */
function StaffHome() {
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { profile } = useSession();
  const [visits, setVisits] = useState<Visit[]>([]);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    fetchWeekVisits(startOfWeekMonday(now)).then((v) => {
      if (!cancelled) setVisits(v);
    });
    return () => {
      cancelled = true;
    };
  }, [now]);

  const today = pickTodayVisit(visits, now);
  const next = pickNextVisit(visits, now);
  const days = weekDays(now, visits, strings.home.weekDays);
  // Regla del dueño (D-223): el staff nunca ve sus horas contra el tope de 32 h; aquí no hay nada de eso.

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Greeting name={profile?.fullName ?? ''} />
        <Bento>
          {today ? (
            <Card tone="brand" wide style={styles.todayCard}>
              <View style={[styles.todayHead, illustrations ? styles.todayHeadArt : null]}>
                <View style={{ gap: 6, flexShrink: 1, paddingBottom: illustrations ? 14 : 0 }}>
                  <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
                    {strings.home.today}
                  </AppText>
                  <AppText weight="heavy" size={22} color="#FFFFFF">
                    {today.siteName}
                  </AppText>
                  <AppText size={14} color="#FFFFFF" style={{ opacity: 0.9 }}>
                    {strings.home.timeRange(formatTime(today.start), formatTime(today.end))}
                  </AppText>
                </View>
                <CartArt />
              </View>
              {/* TEMPORAL: marcar entrada se conecta en el hito 6 (Work) */}
              <View style={styles.slide}>
                <SlideToMark label={strings.home.slideToClockIn} onComplete={() => {}} onBrand />
              </View>
            </Card>
          ) : null}
          {next ? (
            <Card tone="attention" wide style={styles.rowCard}>
              <CalendarIcon />
              <View style={{ gap: 2, flex: 1 }}>
                <AppText size={13} color={colors.attentionText}>
                  {strings.home.next}
                </AppText>
                <AppText weight="bold" size={16}>
                  {`${s.dayNames[next.start.getDay()]} ${next.start.getDate()} · ${formatTime(next.start)}`}
                </AppText>
                <AppText size={12} color={colors.secondary}>
                  {next.siteName}
                </AppText>
              </View>
            </Card>
          ) : null}
          <Card wide style={{ gap: 12 }}>
            <AppText size={13} color={colors.secondary}>
              {strings.home.yourWeek}
            </AppText>
            <WeekStrip days={days} />
          </Card>
        </Bento>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 16 },
  greeting: { paddingTop: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mainCard: { padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  // D-224 (C1): con ilustración la tarjeta mide 172px y el dibujo llega al borde derecho e inferior.
  mainCardArt: { height: 172, paddingRight: 0, paddingBottom: 0, alignItems: 'flex-end' },
  rowCard: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayCard: { padding: 0, gap: 0 },
  todayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, padding: 18 },
  todayHeadArt: { height: 150, paddingRight: 0, paddingBottom: 0 },
  slide: { marginHorizontal: 12, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22 },
});
