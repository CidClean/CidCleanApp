import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, dayKey } from '@/lib/leadRules';
import type { ScheduleVisit } from '@/lib/scheduleApi';
import { formatMinutes } from '@/lib/scheduleRules';
import { abbreviate, firstHour, hourLabel, placeDay, type CalendarMode } from '@/lib/scheduleViews';
import { formatTime } from '@/lib/week';
import { useTheme } from '@/theme';

const HOUR_H = 52; // D-200: alto de una hora en la cuadrícula
const GUTTER = 48;
const GRID_H = 520; // D-200: alto visible de la cuadrícula; se desplaza por horas

type Props = {
  mode: CalendarMode;
  days: readonly string[];
  visits: readonly ScheduleVisit[];
  /** Mes al que pertenece la vista Mes (los días de otros meses van atenuados). */
  month: number;
  onOpen: (v: ScheduleVisit) => void;
  onPickDay: (key: string) => void;
};

/**
 * Calendario del Schedule (D-231): Día, 3 días (el día elegido al centro) y Semana como cuadrícula por horas que se
 * desplaza; Mes como cuadrícula de domingo a sábado. Tocar una visita abre su editor; en Mes, tocar un día abre su Día.
 */
export function ScheduleCalendar({ mode, days, visits, month, onOpen, onPickDay }: Props) {
  if (mode === 'month') return <MonthGrid days={days} visits={visits} month={month} onOpen={onOpen} onPickDay={onPickDay} />;
  return <TimeGrid mode={mode} days={days} visits={visits} onOpen={onOpen} onPickDay={onPickDay} />;
}

function TimeGrid({ mode, days, visits, onOpen, onPickDay }: Omit<Props, 'month'>) {
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const scroll = useRef<{ scrollTo: (o: { y: number; animated?: boolean }) => void } | null>(null);
  const today = dayKey(new Date());
  const start = firstHour(visits);

  useEffect(() => {
    scroll.current?.scrollTo({ y: start * HOUR_H, animated: false });
  }, [start, days]);

  const wide = mode === 'day';
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={[styles.headRow, { borderBottomColor: colors.border }]}>
        <View style={{ width: GUTTER }} />
        {days.map((d) => {
          const date = dateFromKey(d);
          const on = d === today;
          return (
            <Pressable key={d} accessibilityRole="button" onPress={() => onPickDay(d)} style={styles.headCell}>
              <AppText size={11} color={colors.secondary} center>
                {mode === 'week' ? (strings.home.weekDays[date.getDay()] ?? '') : s.dayNames[date.getDay()]}
              </AppText>
              <View style={[styles.dayNum, on ? { backgroundColor: brand } : null]}>
                <AppText weight="heavy" size={14} color={on ? '#FFFFFF' : colors.text} center>
                  {String(date.getDate())}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <ScrollView ref={scroll as never} style={{ height: GRID_H }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', height: 24 * HOUR_H }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, h) => (
              <AppText key={h} size={10} color={colors.secondary} style={[styles.hour, { top: h * HOUR_H - 6 }]}>
                {h === 0 ? '' : hourLabel(h)}
              </AppText>
            ))}
          </View>
          {days.map((d) => (
            <View key={d} style={[styles.col, { borderLeftColor: colors.border }]}>
              {Array.from({ length: 24 }, (_, h) => (
                <View key={h} style={[styles.line, { top: h * HOUR_H, borderTopColor: colors.border }]} />
              ))}
              {placeDay(visits.filter((v) => v.day === d)).map((p) => {
                const staffed = p.visit.staff.length > 0;
                const bg = p.visit.approved ? colors.brandSoft : staffed ? brand : colors.attention;
                const fg = p.visit.approved ? colors.brandText : staffed ? '#FFFFFF' : colors.attentionText;
                const width = 100 / p.lanes;
                return (
                  <Pressable
                    key={p.visit.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.visit.jobsite} ${formatTime(p.visit.startsAt)}`}
                    onPress={() => onOpen(p.visit)}
                    style={[
                      styles.event,
                      {
                        backgroundColor: bg,
                        top: (p.start / 60) * HOUR_H + 1,
                        height: Math.max((p.minutes / 60) * HOUR_H - 2, 22),
                        left: `${p.lane * width}%`,
                        width: `${width}%`,
                      },
                    ]}
                  >
                    <AppText size={wide ? 13 : 10} weight="bold" color={fg} numberOfLines={wide ? 1 : 2}>
                      {wide ? p.visit.jobsite : abbreviate(p.visit.jobsite, mode === 'week' ? 8 : 12)}
                    </AppText>
                    <AppText size={wide ? 12 : 10} color={fg} numberOfLines={1}>
                      {wide ? `${formatTime(p.visit.startsAt)} · ${formatMinutes(p.visit.minutes, t.hours)}` : formatTime(p.visit.startsAt)}
                    </AppText>
                    {wide ? (
                      <AppText size={12} color={fg} numberOfLines={2}>
                        {staffed ? p.visit.staff.map((x) => x.name).join(', ') : t.noStaff}
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function MonthGrid({ days, visits, month, onOpen, onPickDay }: Omit<Props, 'mode'>) {
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const t = useWorkStrings();
  const today = dayKey(new Date());
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  return (
    <View style={[styles.card, { backgroundColor: colors.card, paddingHorizontal: 8 }]}>
      <View style={styles.monthRow}>
        {strings.home.weekDays.map((l, i) => (
          <AppText key={i} size={11} color={colors.secondary} center style={{ flex: 1 }}>
            {l}
          </AppText>
        ))}
      </View>
      {weeks.map((w) => (
        <View key={w[0]} style={styles.monthRow}>
          {w.map((d) => {
            const date = dateFromKey(d);
            const list = visits.filter((v) => v.day === d).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
            const inMonth = date.getMonth() === month;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${date.getDate()}`}
                onPress={() => onPickDay(d)}
                style={[styles.monthCell, { opacity: inMonth ? 1 : 0.45 }]}
              >
                <View style={[styles.monthNum, d === today ? { backgroundColor: brand } : null]}>
                  <AppText size={12} weight="bold" color={d === today ? '#FFFFFF' : colors.text} center>
                    {String(date.getDate())}
                  </AppText>
                </View>
                {list.slice(0, 2).map((v) => (
                  <Pressable
                    key={v.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${v.jobsite} ${formatTime(v.startsAt)}`}
                    onPress={() => onOpen(v)}
                    style={[styles.monthPill, { backgroundColor: v.staff.length ? colors.brandSoft : colors.attention }]}
                  >
                    <AppText size={9} weight="bold" color={v.staff.length ? colors.brandText : colors.attentionText} numberOfLines={1}>
                      {abbreviate(v.jobsite, 7)}
                    </AppText>
                  </Pressable>
                ))}
                {list.length > 2 ? (
                  <AppText size={9} color={colors.secondary} center>
                    {t.more(list.length - 2)}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 12, marginBottom: 12 },
  headRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 0.5 },
  headCell: { flex: 1, alignItems: 'center', gap: 2 },
  dayNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hour: { position: 'absolute', right: 6 },
  col: { flex: 1, borderLeftWidth: 0.5 },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 0.5 },
  event: { position: 'absolute', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 3, overflow: 'hidden' },
  monthRow: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  monthCell: { flex: 1, minHeight: 64, alignItems: 'stretch', gap: 2, paddingVertical: 2 },
  monthNum: { alignSelf: 'center', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthPill: { borderRadius: 4, paddingHorizontal: 2, paddingVertical: 1 },
});
