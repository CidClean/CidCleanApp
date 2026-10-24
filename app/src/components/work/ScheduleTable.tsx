import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { dateFromKey, dayKey, formatShortDate } from '@/lib/leadRules';
import type { ScheduleVisit } from '@/lib/scheduleApi';
import { abbreviate, dayRows, employeeRows } from '@/lib/scheduleViews';
import { formatTime } from '@/lib/week';
import { useTheme } from '@/theme';

const NAME_W = 104;
const CELL_W = 92;

type Props = { mode: 'employee' | 'day'; visits: readonly ScheduleVisit[]; days: readonly string[]; onOpen: (v: ScheduleVisit) => void };

/**
 * Tabla de horario semanal (D-231) en el estilo C1: Empleado → días (fila por persona, columnas D L M X J V S con el
 * jobsite abreviado y la hora; vacía si no trabaja) o Día → empleados (fila por día con fichas persona → jobsite y hora).
 * Tocar una visita abre su editor.
 */
export function ScheduleTable({ mode, visits, days, onOpen }: Props) {
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const today = dayKey(new Date());

  if (visits.length === 0) {
    return (
      <AppText size={13} color={colors.secondary}>
        {t.noVisits}
      </AppText>
    );
  }

  if (mode === 'day') {
    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {dayRows(visits, days).map((r, i) => (
          <View key={r.day} style={[styles.dayRow, { borderBottomColor: colors.border, borderBottomWidth: i === days.length - 1 ? 0 : 0.5 }]}>
            <AppText weight="heavy" size={14} color={r.day === today ? colors.brandText : colors.text}>
              {formatShortDate(dateFromKey(r.day), s)}
            </AppText>
            <View style={styles.chips}>
              {r.chips.length === 0 ? (
                <AppText size={12} color={colors.secondary}>
                  —
                </AppText>
              ) : (
                r.chips.map((c, j) => (
                  <Pressable
                    key={`${c.visit.id}-${j}`}
                    accessibilityRole="button"
                    onPress={() => onOpen(c.visit)}
                    style={[styles.pill, { backgroundColor: c.person ? colors.brandSoft : colors.attention }]}
                  >
                    <AppText size={12} weight="bold" color={c.person ? colors.brandText : colors.attentionText}>
                      {`${c.person ?? t.unstaffed} → ${abbreviate(c.visit.jobsite, 20)} · ${formatTime(c.visit.startsAt)}`}
                    </AppText>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        ))}
      </View>
    );
  }

  const rows = employeeRows(visits, days, t.unstaffed);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, padding: 0, overflow: 'hidden' }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, { backgroundColor: brand }]}>
            <View style={[styles.nameCell, styles.head]}>
              <AppText size={12} weight="bold" color="#FFFFFF">
                {t.employee}
              </AppText>
            </View>
            {days.map((d, i) => (
              <View key={d} style={[styles.cell, styles.head, { alignItems: 'center' }]}>
                <AppText size={12} weight="bold" color="#FFFFFF">
                  {`${strings.home.weekDays[dateFromKey(d).getDay()] ?? ''} ${dateFromKey(d).getDate()}`}
                </AppText>
              </View>
            ))}
          </View>
          {rows.map((r, i) => (
            <View key={r.id || 'none'} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}>
              <View style={styles.nameCell}>
                <AppText size={13} weight="bold" color={r.id ? colors.text : colors.attentionText} numberOfLines={2}>
                  {r.name}
                </AppText>
              </View>
              {r.cells.map((cell, j) => (
                <View key={days[j]} style={[styles.cell, { gap: 4 }, days[j] === today ? { backgroundColor: colors.surface } : null]}>
                  {cell.map((v) => (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${v.jobsite} ${formatTime(v.startsAt)}`}
                      onPress={() => onOpen(v)}
                      style={[styles.box, { backgroundColor: r.id ? colors.brandSoft : colors.attention }]}
                    >
                      <AppText size={11} weight="bold" color={r.id ? colors.brandText : colors.attentionText} numberOfLines={1}>
                        {abbreviate(v.jobsite)}
                      </AppText>
                      <AppText size={11} color={colors.text}>
                        {formatTime(v.startsAt)}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row' },
  head: { paddingVertical: 10 },
  nameCell: { width: NAME_W, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  cell: { width: CELL_W, paddingHorizontal: 4, paddingVertical: 6 },
  box: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  dayRow: { paddingVertical: 10, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
