import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { SUNDAY_FIRST } from '@/lib/weekOrder';
import { useTheme } from '@/theme';

type Props = { labels: readonly string[]; selected: readonly number[]; disabled?: boolean; onToggle: (day: number) => void };

/**
 * Selector de días (D-038, muestras ronda 8 y 12 `.days`): 7 botones de nombre corto en una fila (de domingo a sábado, D-231), 12px,
 * relleno de 10px, esquinas de 8px, contorno al 32%; el marcado con fondo de marca y texto blanco en medio peso.
 */
export function DayButtons({ labels, selected, disabled = false, onToggle }: Props) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.row}>
      {SUNDAY_FIRST.map((day) => {
        const label = labels[day] ?? '';
        const on = selected.includes(day);
        return (
          <Pressable
            key={label}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={label}
            onPress={disabled ? undefined : () => onToggle(day)}
            style={[styles.day, on ? { backgroundColor: brand, borderColor: brand } : { borderColor: colors.fieldBorder }]}
          >
            <AppText size={12} weight={on ? 'medium' : 'regular'} color={on ? '#FFFFFF' : colors.secondary} center>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
});
