import { Pressable, StyleSheet } from 'react-native';

import { View } from 'react-native';

import { AppText } from './AppText';
import type { WeekDay } from '@/lib/week';
import { radius, useTheme } from '@/theme';

/** Tira de 7 días con los días de visita en fondo de marca (D-048); D-223: cuadros de 52px con esquinas de 16px. */
export function WeekStrip({ days, selected, onSelect }: { days: WeekDay[]; selected?: string | null; onSelect?: (key: string) => void }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.strip}>
      {days.map((d) => (
        <Pressable
          key={d.key}
          accessibilityRole={onSelect ? 'button' : undefined}
          accessibilityLabel={`${d.label} ${d.dayNumber}`}
          accessibilityState={{ selected: selected === d.key }}
          onPress={onSelect ? () => onSelect(d.key) : undefined}
          style={[
            styles.cell,
            { backgroundColor: d.hasVisit ? brand : colors.surface },
            // D-165: el día elegido lleva un borde de 2px.
            selected === d.key ? { borderWidth: 2, borderColor: colors.text } : null,
          ]}
        >
          <AppText size={12} color={d.hasVisit ? '#FFFFFF' : colors.secondary} center>
            {d.label}
          </AppText>
          <AppText weight="bold" color={d.hasVisit ? '#FFFFFF' : colors.text} center>
            {String(d.dayNumber)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, height: 52, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
