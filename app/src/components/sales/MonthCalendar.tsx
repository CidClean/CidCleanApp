import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Icon } from '../Icon';
import type { CalendarCell } from '@/lib/leadRules';
import { iconStrokeWidth, radius, useTheme } from '@/theme';

type Props = {
  title: string;
  weekDays: readonly string[];
  weeks: CalendarCell[][];
  onSelect: (key: string) => void;
  onPrevious?: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
};

/**
 * Calendario del mes (D-072, D-104; muestra ronda 12 `.mes` y `.cal`): mes con flechas en un recuadro con contorno,
 * cuadrícula de 7 columnas de lunes a domingo, 13px en gris secundario, día elegido con fondo de marca y
 * esquinas de 8px, y punto de 4px en los días con citas. Los días de otros meses y los ya pasados van al 35%.
 */
export function MonthCalendar({ title, weekDays, weeks, onSelect, onPrevious, onNext, previousLabel, nextLabel }: Props) {
  const { colors, brand } = useTheme();
  return (
    <View>
      <View style={[styles.month, { borderColor: colors.fieldBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousLabel}
          accessibilityState={{ disabled: !onPrevious }}
          onPress={onPrevious}
          hitSlop={12}
          style={{ opacity: onPrevious ? 1 : 0.35 }}
        >
          <Icon name="chevron-left" size={16} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
        <AppText weight="medium">{title}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} hitSlop={12}>
          <Icon name="chevron-right" size={16} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        <View style={styles.week}>
          {weekDays.map((d, i) => (
            <View key={`${d}${i}`} style={styles.cell}>
              <AppText size={13} color={colors.secondary} center>
                {d}
              </AppText>
            </View>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]?.key} style={styles.week}>
            {week.map((c) => {
              const selectable = c.inMonth && !c.past;
              const color = c.selected ? '#FFFFFF' : colors.secondary;
              return (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  accessibilityLabel={c.key}
                  accessibilityState={{ selected: c.selected, disabled: !selectable }}
                  onPress={selectable ? () => onSelect(c.key) : undefined}
                  style={[
                    styles.cell,
                    c.selected ? { backgroundColor: brand } : null,
                    !selectable ? { opacity: 0.35 } : null,
                  ]}
                >
                  <AppText size={13} weight={c.selected ? 'medium' : 'regular'} color={color} center>
                    {c.day}
                  </AppText>
                  {c.hasAppointment ? <View testID={`dot-${c.key}`} style={[styles.dot, { backgroundColor: color }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  month: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  grid: { gap: 4, marginBottom: 10 },
  week: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
