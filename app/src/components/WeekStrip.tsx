import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { WeekDay } from '@/lib/week';
import { radius, useTheme } from '@/theme';

/** Tira de 7 días con los días de visita en fondo de marca (D-048); D-223: cuadros de 52px con esquinas de 16px. */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.strip}>
      {days.map((d) => (
        <View
          key={d.key}
          style={[
            styles.cell,
            { backgroundColor: d.hasVisit ? brand : colors.surface },
          ]}
        >
          <AppText size={12} color={d.hasVisit ? '#FFFFFF' : colors.secondary} center>
            {d.label}
          </AppText>
          <AppText weight="bold" color={d.hasVisit ? '#FFFFFF' : colors.text} center>
            {String(d.dayNumber)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, height: 52, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
