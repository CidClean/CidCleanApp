import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { SelectField } from '@/components/SelectField';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { Bento, Card, useCardText, type CardTone } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { Pill } from '@/components/bento/Pill';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStatisticsStrings } from '@/i18n/useStatisticsStrings';
import { useStrings } from '@/i18n/useStrings';
import { money, monthTitle, periodTitle, type Period } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { shareCsv, sharePdf } from '@/lib/sharePdf';
import { fetchStatistics } from '@/lib/statisticsApi';
import {
  absenceDay,
  absenceTarget,
  hours,
  missing,
  pct,
  perHour,
  punctualityPct,
  statsCsv,
  statsFileName,
  statsHtml,
  trendScale,
  usedPct,
  type AccountStats,
  type Absence,
  type EmployeeStats,
  type StatisticsReport,
  type StatsTab,
  type TrendMonth,
} from '@/lib/statisticsRules';
import { can } from '@/lib/visibility';
import { useTheme } from '@/theme';

/** Colores de la tendencia de la muestra D-253: ingreso en marca, personal en destello y profit en verde claro. */
const TREND = { income: '#0F766E', staff: '#F2C27B', profit: '#2FB8AE' } as const;

/**
 * Estadísticas (D-252, D-253; muestra surveys/dashboard-estadisticas-aprobado.html en el bento C1): pestañas
 * Cuentas, Empleados y Tendencia, selector de mes y Rango (como Accounting), exportar CSV de la pestaña y PDF con la
 * marca. Cuentas: horas reales y pagadas, pagadas sin trabajar con su % aprovechado, ingreso y costo por hora,
 * duración real contra la estimada, puntualidad de las entradas propias, turnos programados contra trabajados con las
 * faltas (tocar una lleva a esa visita) y el detalle por empleado. Solo con estadisticas_ver.
 */
export default function StatisticsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const s = useStatisticsStrings();
  const a = useAccountingStrings();
  const { access } = usePermissions();
  const { period, setPeriod } = usePeriod();
  const [tab, setTab] = useState<StatsTab>('accounts');
  const [data, setData] = useState<StatisticsReport | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const allowed = can(access, 'estadisticas_ver');
  const key = `${period.from}:${period.to}`;

  const load = useCallback(async () => {
    if (!allowed) return;
    setFailed(false);
    const r = await fetchStatistics(period);
    setFailed(!r.ok);
    setData(r.ok ? r.data : null);
    setLoadedFor(`${period.from}:${period.to}`);
  }, [allowed, period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!allowed) return <Redirect href="/" />;

  const target = absenceTarget(access);
  const openAbsence = target
    ? (x: Absence) =>
        router.push({ pathname: target === 'visit' ? '/schedule/visit/[id]' : '/schedule/work/[id]', params: { id: x.visitId } })
    : null;

  function shared(r: 'shared' | 'unavailable' | 'error') {
    setNotice(r === 'unavailable' ? s.shareUnavailable : r === 'error' ? s.shareError : null);
  }

  async function exportCsv() {
    if (!data || busy) return;
    setBusy(true);
    setNotice(null);
    shared(await shareCsv(statsCsv(tab, data, s), statsFileName(tab, period), s.tabs[tab]));
    setBusy(false);
  }

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true);
    setNotice(null);
    shared(await sharePdf(statsHtml(data, period, s, a), s.pdfTitle(periodTitle(period, a))));
    setBusy(false);
  }

  const loading = loadedFor !== key && !failed;
  const account = data ? (data.accounts.find((x) => x.jobsiteId === accountId) ?? data.accounts[0] ?? null) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={s.title} />
      <ScrollView contentContainerStyle={styles.page}>
        {/* Muestra D-253 `.seg`: tres pestañas en píldoras, la activa en marca. */}
        <View style={styles.seg} accessibilityRole="tablist">
          {(['accounts', 'employees', 'trend'] as const).map((k) => {
            const on = k === tab;
            return (
              <Pressable
                key={k}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setTab(k)}
                style={[styles.segItem, { backgroundColor: on ? brand : colors.card }]}
              >
                <AppText weight="bold" size={13} color={on ? '#FFFFFF' : colors.text}>
                  {s.tabs[k]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <PeriodBar period={period} onChange={setPeriod} />
        {failed ? <AppAlert tone="error" text={s.errorLoad} /> : null}
        {loading ? <BrandLoading size={56} center={false} label={s.loading} /> : null}
        {!loading && data ? (
          tab === 'accounts' ? (
            data.accounts.length === 0 ? (
              <Empty text={s.empty} />
            ) : (
              <>
                {data.accounts.length > 1 ? (
                  <SelectField
                    label={s.account}
                    options={data.accounts.map((x) => ({ value: x.jobsiteId, label: `${x.name} · ${x.client}` }))}
                    value={account?.jobsiteId ?? ''}
                    onChange={(v) => setAccountId(v || null)}
                  />
                ) : null}
                {account ? <AccountView x={account} period={period} onAbsence={openAbsence} /> : null}
              </>
            )
          ) : tab === 'employees' ? (
            data.employees.length === 0 ? (
              <Empty text={s.noEmployees} />
            ) : (
              <Bento>
                {data.employees.map((e) => (
                  <EmployeeCard key={e.profileId} e={e} onAbsence={openAbsence} />
                ))}
              </Bento>
            )
          ) : (
            <TrendView months={data.trend} />
          )
        ) : null}
        {notice ? <AppAlert text={notice} /> : null}
        {!loading && data ? (
          <View style={styles.exports}>
            <View style={{ flex: 1 }}>
              <AppButton label={s.exportCsv} variant="outline" icon="share" onPress={() => void exportCsv()} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton label={s.exportPdf} icon="file-text" onPress={() => void exportPdf()} disabled={busy} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Card wide style={{ alignItems: 'center', paddingVertical: 22 }}>
      <AppText size={13} color={colors.secondary} center>
        {text}
      </AppText>
    </Card>
  );
}

/** Cifra de una tarjeta (muestra `.k` 12px, `.mid` 22px/800 y la línea de 12px). */
function Stat({ tone = 'plain', wide = false, label, value, sub, right }: { tone?: CardTone; wide?: boolean; label: string; value: string; sub?: string; right?: ReactNode }) {
  const t = useCardText(tone);
  return (
    <Card tone={tone} wide={wide} style={{ gap: 2 }}>
      <AppText size={12} weight="medium" color={t.soft} style={{ opacity: t.softOpacity }}>
        {label}
      </AppText>
      <View style={styles.between}>
        <AppText weight="heavy" size={22} color={t.main}>
          {value}
        </AppText>
        {right}
      </View>
      {sub ? (
        <AppText size={12} color={t.soft} style={{ opacity: t.softOpacity }}>
          {sub}
        </AppText>
      ) : null}
    </Card>
  );
}

/** Renglón de la muestra `.row`: 13px, 7px arriba y abajo, línea fina entre renglones. */
function KRow({ left, right, first = false, onPress, dark = false }: { left: string; right: ReactNode; first?: boolean; onPress?: () => void; dark?: boolean }) {
  const { colors } = useTheme();
  const box = [styles.krow, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dark ? 'rgba(255,255,255,0.12)' : colors.border }];
  const body = (
    <>
      <AppText size={13} color={dark ? colors.darkCardText : colors.text} style={{ flex: 1 }}>
        {left}
      </AppText>
      {typeof right === 'string' ? (
        <AppText size={13} weight="bold" color={dark ? colors.darkCardText : colors.text}>
          {right}
        </AppText>
      ) : (
        right
      )}
    </>
  );
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={left} onPress={onPress} style={box}>
        {body}
      </Pressable>
    );
  return <View style={box}>{body}</View>;
}

function useAbsenceDay() {
  const sales = useSalesStrings();
  const { locale } = useSession();
  return (day: string) => absenceDay(day, sales.dayNames, sales.monthShort, locale);
}

function AccountView({ x, period, onAbsence }: { x: AccountStats; period: Period; onAbsence: ((a: Absence) => void) | null }) {
  const { colors, brand } = useTheme();
  const s = useStatisticsStrings();
  const a = useAccountingStrings();
  const dayText = useAbsenceDay();
  const used = usedPct(x);
  const income = perHour(x.expected, x.workedMinutes);
  const cost = perHour(x.staff, x.workedMinutes);
  const punctual = punctualityPct(x);
  const est = x.estMinutes;
  return (
    <Bento>
      <Card wide style={{ gap: 4 }}>
        <View style={styles.between}>
          <AppText weight="heavy" size={16} style={{ flexShrink: 1 }}>
            {x.name}
          </AppText>
          {x.margin !== null ? <Pill tone={x.margin > 0 ? 'ok' : 'warn'} label={s.marginChip(pct(x.margin))} /> : null}
        </View>
        <AppText size={12} weight="medium" color={colors.secondary}>
          {s.accountLine(x.client, x.shifts, x.visits)}
        </AppText>
      </Card>
      <Stat label={s.workedHours} value={hours(x.workedMinutes)} sub={s.workedHoursSub} />
      <Stat label={s.paidHours} value={hours(x.paidMinutes)} sub={s.paidHoursSub} />
      <Card wide style={{ gap: 4 }}>
        <AppText size={12} weight="medium" color={colors.secondary}>
          {s.unworked}
        </AppText>
        <View style={styles.between}>
          <AppText weight="heavy" size={22}>
            {`${hours(x.unworkedMinutes)} · ${money(x.unworkedAmount)}`}
          </AppText>
          {used !== null ? <Pill tone={used >= 95 ? 'ok' : 'warn'} label={s.usedChip(pct(used))} /> : null}
        </View>
        <View accessible accessibilityLabel={s.unworkedBar} style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${used ?? 0}%`, backgroundColor: brand }]} />
        </View>
        <AppText size={12} color={colors.secondary}>
          {s.unworkedNote}
        </AppText>
      </Card>
      <Stat tone="brand" label={s.incomePerHour} value={income === null ? '—' : money(income)} sub={s.incomePerHourSub} />
      <Stat
        label={s.costPerHour}
        value={cost === null ? '—' : money(cost)}
        sub={income !== null && cost !== null ? s.leftPerHour(money(income - cost)) : undefined}
      />
      <Stat
        label={s.realDuration}
        value={x.avgMinutes === null ? '—' : hours(x.avgMinutes)}
        sub={est === null ? s.noEstimate : s.vsEstimated(hours(est))}
      />
      {punctual === null ? (
        <Stat tone="attention" label={s.punctuality} value="—" sub={s.punctualityNone(x.punctualSelf, x.shifts)} />
      ) : (
        <Stat label={s.punctuality} value={`${pct(punctual)}%`} sub={s.punctualityLine(x.punctualOnTime, x.punctualSelf)} />
      )}
      <ShiftsCard f={x} onAbsence={onAbsence} dayText={dayText} />
      {x.employees.length > 0 ? (
        <Card wide>
          <AppText size={12} weight="medium" color={colors.secondary} style={{ marginBottom: 6 }}>
            {s.byEmployee(periodTitle(period, a))}
          </AppText>
          {x.employees.map((e, i) => (
            <KRow key={e.profileId} first={i === 0} left={e.name} right={s.employeeRow(e.scheduledWorked, e.scheduled, hours(e.paidMinutes), money(e.cost))} />
          ))}
          <AppText size={12} color={colors.secondary} style={{ marginTop: 6 }}>
            {s.employeeNote}
          </AppText>
        </Card>
      ) : null}
    </Bento>
  );
}

function ShiftsCard({
  f,
  onAbsence,
  dayText,
}: {
  f: Pick<AccountStats, 'scheduled' | 'scheduledWorked' | 'absences'>;
  onAbsence: ((a: Absence) => void) | null;
  dayText: (d: string) => string;
}) {
  const { colors } = useTheme();
  const s = useStatisticsStrings();
  const miss = missing(f);
  return (
    <Card wide style={{ gap: 4 }}>
      <AppText size={12} weight="medium" color={colors.secondary}>
        {s.shifts}
      </AppText>
      <View style={styles.between}>
        <AppText weight="heavy" size={22}>
          {s.shiftsOf(f.scheduledWorked, f.scheduled)}
        </AppText>
        {miss > 0 ? <Pill tone="warn" label={s.missingChip(miss)} /> : <Pill tone="ok" label={s.noMissingChip} />}
      </View>
      <AppText size={12} color={colors.secondary}>
        {s.shiftsNote}
      </AppText>
      {f.absences.map((x, i) => (
        <KRow
          key={`${x.visitId}-${x.profileId}`}
          first={i === 0}
          left={`${x.name} · ${dayText(x.day)}`}
          right={<Pill tone="warn" label={s.absence} />}
          onPress={onAbsence ? () => onAbsence(x) : undefined}
        />
      ))}
    </Card>
  );
}

function EmployeeCard({ e, onAbsence }: { e: EmployeeStats; onAbsence: ((a: Absence) => void) | null }) {
  const { colors } = useTheme();
  const s = useStatisticsStrings();
  const dayText = useAbsenceDay();
  const punctual = punctualityPct(e);
  const used = usedPct(e);
  return (
    <Card wide style={{ gap: 2 }}>
      <View style={styles.between}>
        <AppText weight="heavy" size={16} style={{ flexShrink: 1 }}>
          {e.name}
        </AppText>
        <Pill tone={missing(e) > 0 ? 'warn' : 'ok'} label={missing(e) > 0 ? s.missingChip(missing(e)) : s.noMissingChip} />
      </View>
      <AppText size={12} weight="medium" color={colors.secondary} style={{ marginBottom: 4 }}>
        {e.workerType === '1099' ? '1099' : 'W-2'}
      </AppText>
      <KRow first left={s.shiftsShort} right={s.shiftsOf(e.scheduledWorked, e.scheduled)} />
      <KRow left={s.workedHours} right={hours(e.workedMinutes)} />
      <KRow left={s.paidHours} right={hours(e.paidMinutes)} />
      <KRow
        left={s.unworked}
        right={`${hours(e.unworkedMinutes)} · ${money(e.unworkedAmount)}${used === null ? '' : ` · ${s.usedChip(pct(used))}`}`}
      />
      <KRow left={s.cost} right={money(e.cost)} />
      <KRow left={s.punctuality} right={punctual === null ? '—' : `${pct(punctual)}% · ${e.punctualOnTime}/${e.punctualSelf}`} />
      {e.absences.map((x) => (
        <KRow
          key={`${x.visitId}-${x.profileId}`}
          left={`${x.jobsite} · ${dayText(x.day)}`}
          right={<Pill tone="warn" label={s.absence} />}
          onPress={onAbsence ? () => onAbsence(x) : undefined}
        />
      ))}
    </Card>
  );
}

/** Tendencia (muestra D-253): barras por mes de ingreso, personal y profit en SVG, con la tabla del periodo debajo. */
function TrendView({ months }: { months: TrendMonth[] }) {
  const { colors } = useTheme();
  const s = useStatisticsStrings();
  const a = useAccountingStrings();
  const max = trendScale(months);
  const W = 320;
  const H = 150;
  const base = 120;
  const top = 20;
  const left = 30;
  const slot = (W - left - 10) / Math.max(1, months.length);
  const bar = Math.min(22, (slot - 12) / 3);
  const h = (v: number) => (Math.max(0, v) / max) * (base - top);
  const tick = (v: number) => (v >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${Math.round(v)}`);
  const label = months
    .map((m) => `${monthTitle(m.month.slice(0, 7), a)}: ${s.income} ${money(m.expected)}, ${s.staff} ${money(m.staff)}, ${s.profit} ${money(m.profit)}`)
    .join('. ');
  return (
    <Bento>
      <Card wide>
        <AppText size={12} weight="medium" color={colors.secondary} style={{ marginBottom: 6 }}>
          {s.trendTitle}
        </AppText>
        <View accessible accessibilityRole="image" accessibilityLabel={s.trendChart(label)}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
            <Line x1={left} y1={base} x2={W - 10} y2={base} stroke={colors.border} />
            <Line x1={left} y1={(base + top) / 2} x2={W - 10} y2={(base + top) / 2} stroke={colors.border} strokeDasharray="3 4" />
            <Line x1={left} y1={top} x2={W - 10} y2={top} stroke={colors.border} strokeDasharray="3 4" />
            <SvgText x={0} y={base + 4} fontSize={9} fill={colors.secondary}>
              $0
            </SvgText>
            <SvgText x={0} y={(base + top) / 2 + 4} fontSize={9} fill={colors.secondary}>
              {tick(max / 2)}
            </SvgText>
            <SvgText x={0} y={top + 4} fontSize={9} fill={colors.secondary}>
              {tick(max)}
            </SvgText>
            {months.map((m, i) => {
              const x0 = left + i * slot + (slot - bar * 3 - 8) / 2;
              const bars = [
                { v: m.expected, c: TREND.income },
                { v: m.staff, c: TREND.staff },
                { v: m.profit, c: TREND.profit },
              ];
              return bars
                .map((b, j) => (
                  <Rect key={`${m.month}-${j}`} x={x0 + j * (bar + 4)} y={base - h(b.v)} width={bar} height={h(b.v)} rx={4} fill={b.c} />
                ))
                .concat(
                  <SvgText key={`${m.month}-l`} x={x0 + (bar * 3 + 8) / 2} y={base + 18} fontSize={10} fill={colors.secondary} textAnchor="middle">
                    {a.months[Number(m.month.slice(5, 7)) - 1].slice(0, 3)}
                  </SvgText>,
                  <SvgText key={`${m.month}-p`} x={x0 + 2 * (bar + 4) + bar / 2} y={base - h(m.profit) - 4} fontSize={9} fill={colors.text} textAnchor="middle">
                    {money(m.profit).replace(/\.\d\d$/, '')}
                  </SvgText>,
                );
            })}
          </Svg>
        </View>
        <View style={styles.legend}>
          {(
            [
              [s.income, TREND.income],
              [s.staff, TREND.staff],
              [s.profit, TREND.profit],
            ] as const
          ).map(([t, c]) => (
            <View key={t} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: c }]} />
              <AppText size={12} color={colors.secondary}>
                {t}
              </AppText>
            </View>
          ))}
        </View>
      </Card>
      {months.map((m) => (
        <Card key={m.month} wide>
          <AppText weight="heavy" size={15} style={{ marginBottom: 2 }}>
            {monthTitle(m.month.slice(0, 7), a)}
          </AppText>
          <KRow first left={s.income} right={money(m.expected)} />
          <KRow left={s.staff} right={money(m.staff)} />
          <KRow left={s.expenses} right={money(m.expenses)} />
          <KRow left={s.profit} right={money(m.profit)} />
        </Card>
      ))}
    </Bento>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  seg: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  krow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 7 },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 6 },
  legend: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  exports: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
