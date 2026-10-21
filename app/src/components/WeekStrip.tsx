import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { WeekDay } from '@/lib/week';
import { radius, useTheme } from '@/theme';

/** Tira de 7 días con los días de visita en fondo de marca (D-048). */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.strip}>
      {days.map((d) => (
        <View
          key={d.key}
          style={[
            styles.cell,
            d.hasVisit
              ? { backgroundColor: brand, borderColor: brand }
              : { borderColor: colors.fieldBorder },
          ]}
        >
          <AppText size={12} color={d.hasVisit ? '#FFFFFF' : colors.secondary} center>
            {d.label}
          </AppText>
          <AppText weight="medium" color={d.hasVisit ? '#FFFFFF' : colors.secondary} center>
            {String(d.dayNumber)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  cell: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
});
