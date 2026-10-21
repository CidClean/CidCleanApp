import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { SlideToMark } from '@/components/SlideToMark';
import { TodayCard } from '@/components/TodayCard';
import { TopBar } from '@/components/TopBar';
import { WeekStrip } from '@/components/WeekStrip';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { salesPendingRows, showsSalesPending, sortPending, type SalesPendingCounts } from '@/lib/leadRules';
import { fetchSalesPending } from '@/lib/leadsApi';
import { usePermissions } from '@/lib/session';
import { homeKind, showsMonthFigures } from '@/lib/visibility';
import { fetchWeekVisits, formatTime, pickTodayVisit, startOfWeekMonday, weekDays, type Visit } from '@/lib/week';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Inicio: el del admin para el Super Admin y quien tenga algún permiso; el del staff para quien no tenga ninguno (D-169). */
export default function HomeScreen() {
  const { access } = usePermissions();
  return homeKind(access) === 'admin' ? <AdminHome /> : <StaffHome />;
}

/**
 * Inicio del admin (D-111, D-164): una sola lista de pendientes por urgencia, solo de las áreas con permiso.
 * Por ahora la alimentan los seguimientos de leads y los walkthroughs agendados (hito 2); sin pendientes, "Todo al día".
 */
function AdminHome() {
  const { colors, status } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const router = useRouter();
  const { access } = usePermissions();
  const [sales, setSales] = useState<SalesPendingCounts | null>(null);
  const salesVisible = showsSalesPending(access);

  useFocusEffect(
    useCallback(() => {
      if (!salesVisible) return;
      let cancelled = false;
      void fetchSalesPending().then((result) => {
        if (!cancelled && result.ok) setSales(result.data);
      });
      return () => {
        cancelled = true;
      };
    }, [salesVisible]),
  );

  const pending = sortPending(salesPendingRows(access, sales, s));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.home} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {showsMonthFigures(access) ? (
          // TEMPORAL: cifras en $0 hasta que Accounting tenga datos
          <View style={styles.stats}>
            <View>
              <AppText size={sample.noteSize} color={colors.secondary}>
                {strings.home.income}
              </AppText>
              <AppText weight="medium" size={18}>
                $0
              </AppText>
            </View>
            <View>
              <AppText size={sample.noteSize} color={colors.secondary}>
                {strings.home.profit}
              </AppText>
              <AppText weight="medium" size={18}>
                $0
              </AppText>
            </View>
          </View>
        ) : null}
        {/* Lista de pendientes por urgencia (D-111, D-131). Las demás áreas se suman en sus hitos. */}
        {pending.map((row, i) => (
          <ListRow
            key={row.key}
            title={row.title}
            detail={row.detail}
            right={row.urgent ? <Chip label={s.home.urgent} tone="warning" /> : undefined}
            chevron={!row.urgent}
            last={i === pending.length - 1}
            onPress={() => router.navigate('/pipeline')}
          />
        ))}
        {pending.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="circle-check" size={24} strokeWidth={iconStrokeWidth} color={status.success} />
            <AppText weight="medium">{strings.home.caughtUp}</AppText>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {strings.home.nothingToReview}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Inicio del staff (D-165): visita de hoy (solo si hay), "Desliza para marcar entrada" con la tarjeta y la tira de la semana. */
function StaffHome() {
  const { colors } = useTheme();
  const strings = useStrings();
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
  const days = weekDays(now, visits, strings.home.weekDays);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.home} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {today ? (
          <>
            <TodayCard
              label={strings.home.today}
              siteName={today.siteName}
              range={strings.home.timeRange(formatTime(today.start), formatTime(today.end))}
            />
            {/* TEMPORAL: marcar entrada se conecta en la etapa 4 (Work) */}
            <View style={{ marginBottom: 12 }}>
              <SlideToMark label={strings.home.slideToClockIn} onComplete={() => {}} />
            </View>
          </>
        ) : null}
        <WeekStrip days={days} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22 },
});
