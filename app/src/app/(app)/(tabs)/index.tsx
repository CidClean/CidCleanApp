import { IconCircleCheck } from '@tabler/icons-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { SlideToMark } from '@/components/SlideToMark';
import { TodayCard } from '@/components/TodayCard';
import { TopBar } from '@/components/TopBar';
import { WeekStrip } from '@/components/WeekStrip';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { homeKind, showsMonthFigures } from '@/lib/visibility';
import { fetchWeekVisits, formatTime, pickTodayVisit, startOfWeekMonday, weekDays, type Visit } from '@/lib/week';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Inicio: el del admin para el Super Admin y quien tenga algún permiso; el del staff para quien no tenga ninguno (D-169). */
export default function HomeScreen() {
  const { access } = usePermissions();
  return homeKind(access) === 'admin' ? <AdminHome /> : <StaffHome />;
}

/** Inicio del admin (D-111, D-164). Aún no hay pendientes ni datos, así que muestra el estado vacío. */
function AdminHome() {
  const { colors, status } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
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
        {/* TEMPORAL: la lista de pendientes por urgencia (D-111, D-131) se conecta cuando existan sus fuentes */}
        <View style={styles.empty}>
          <IconCircleCheck size={24} strokeWidth={iconStrokeWidth} color={status.success} />
          <AppText weight="medium">{strings.home.caughtUp}</AppText>
          <AppText size={sample.noteSize} color={colors.secondary}>
            {strings.home.nothingToReview}
          </AppText>
        </View>
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
