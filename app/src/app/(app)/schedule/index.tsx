import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/bento/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, dayKey, formatShortDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { fetchSchedule, fetchToApprove, type ScheduleVisit, type ToApprove } from '@/lib/scheduleApi';
import { formatMinutes, groupByDay, mondayOf, weekWarning } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { can, canAny } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

const WORK_KEYS = ['work_aprobar', 'work_editar', 'work_revisar_gps', 'work_registrar_por_otros'];

/**
 * Schedule y Work (D-214): Schedule como lista por día con todos los jobsites y su personal (semana con flechas y + para
 * una visita a mano) y Por aprobar (D-053) con ficha Pendiente, Urgente (D-131) y GPS fuera de rango (D-054).
 */
export default function ScheduleScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const seesSchedule = can(access, 'schedule_ver_editar');
  const seesWork = canAny(access, WORK_KEYS);
  const [tab, setTab] = useState<'schedule' | 'approve'>(params.tab === 'approve' || !seesSchedule ? 'approve' : 'schedule');
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [visits, setVisits] = useState<ScheduleVisit[] | null>(null);
  const [toApprove, setToApprove] = useState<ToApprove[] | null>(null);
  const [failed, setFailed] = useState(false);

  const from = dayKey(monday);
  const to = dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const load = useCallback(async () => {
    setFailed(false);
    if (tab === 'schedule' && seesSchedule) {
      const r = await fetchSchedule(from, to);
      if (r.ok) setVisits(r.data);
      else setFailed(true);
    }
    if (tab === 'approve' && seesWork) {
      const r = await fetchToApprove();
      if (r.ok) setToApprove(r.data);
      else setFailed(true);
    }
  }, [tab, from, to, seesSchedule, seesWork]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!seesSchedule && !seesWork) return <Redirect href="/" />;
  const dayTitle = (key: string) => formatShortDate(dateFromKey(key), s);
  const shift = (weeks: number) => setMonday((m) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + weeks * 7));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t.title}
        onBack={goBack}
        backLabel={strings.common.back}
        action={tab === 'schedule' && seesSchedule ? { icon: 'plus', accessibilityLabel: t.newVisit, onPress: () => router.push('/schedule/new') } : undefined}
      />
      <ScrollView contentContainerStyle={styles.page}>
        {seesSchedule && seesWork ? (
          <Segmented
            options={[
              { value: 'schedule', label: t.tabSchedule },
              { value: 'approve', label: t.tabApprove },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : null}
        {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}

        {tab === 'schedule' ? (
          <>
            <View style={[styles.week, { backgroundColor: colors.card }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.previousWeek} onPress={() => shift(-1)} hitSlop={12}>
                <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
              </Pressable>
              <AppText weight="bold">{`${dayTitle(from)} – ${dayTitle(to)}`}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={t.followingWeek} onPress={() => shift(1)} hitSlop={12}>
                <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
              </Pressable>
            </View>
            {visits && visits.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noVisits}
              </AppText>
            ) : null}
            {groupByDay(visits ?? []).map((g) => (
              <View key={g.day} style={{ marginBottom: 12, gap: 8 }}>
                <AppText weight="heavy" size={16}>
                  {dayTitle(g.day)}
                </AppText>
                {g.visits.map((v) => {
                  const warn = v.staff.filter((p) => weekWarning(p.weekMinutes ?? 0));
                  return (
                    <Card
                      key={v.id}
                      wide
                      accessibilityLabel={`${v.jobsite} ${formatTime(v.startsAt)}`}
                      onPress={() => router.push({ pathname: '/schedule/visit/[id]', params: { id: v.id, day: v.day } })}
                      style={{ gap: 6, paddingVertical: 14 }}
                    >
                      <View style={styles.rowHead}>
                        <View style={{ flex: 1 }}>
                          <AppText weight="bold" size={15}>
                            {v.jobsite}
                          </AppText>
                          <AppText size={12} color={colors.secondary}>
                            {`${formatTime(v.startsAt)} · ${formatMinutes(v.minutes, t.hours)} · ${v.client}`}
                          </AppText>
                        </View>
                        {v.approved ? <Chip label={t.approved} tone="success" /> : null}
                      </View>
                      <AppText size={13} color={v.staff.length ? colors.text : colors.attentionText}>
                        {v.staff.length ? v.staff.map((p) => p.name).join(', ') : t.noStaff}
                      </AppText>
                      {warn.length ? (
                        <AppText size={12} color={colors.attentionText}>
                          {t.warn28(warn.map((p) => `${p.name} (${formatMinutes(p.weekMinutes ?? 0, t.hours)})`).join(', '))}
                        </AppText>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            ))}
          </>
        ) : null}

        {tab === 'approve' ? (
          <View style={{ gap: 10 }}>
            {toApprove && toApprove.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.nothingToApprove}
              </AppText>
            ) : null}
            {(toApprove ?? []).map((w) => (
              <Card
                key={w.id}
                wide
                accessibilityLabel={`${w.jobsite} ${dayTitle(w.day)}`}
                onPress={() => router.push({ pathname: '/schedule/work/[id]', params: { id: w.id } })}
                style={{ gap: 6, paddingVertical: 14 }}
              >
                <View style={styles.rowHead}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" size={15}>
                      {w.jobsite}
                    </AppText>
                    <AppText size={12} color={colors.secondary}>
                      {`${dayTitle(w.day)} · ${t.summary(t.people(w.people), formatMinutes(w.minutes, t.hours))}`}
                    </AppText>
                  </View>
                  <Chip label={w.urgent ? t.urgent : t.pendingChip} tone="warning" />
                </View>
                {w.gpsOut || w.open ? (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {w.gpsOut ? <Chip label={t.gpsOut} tone="warning" /> : null}
                    {w.open ? <Chip label={t.open} tone="warning" /> : null}
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  week: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, padding: 12, marginBottom: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
