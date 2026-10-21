import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { iconStrokeWidth, useTheme } from '@/theme';

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void };

/** Casilla de 20px, radio 6, marcada en color de marca (muestras aprobadas). */
export function Checkbox({ label, checked, onChange }: Props) {
  const { colors, brand } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked ? { backgroundColor: brand } : { borderWidth: 1, borderColor: colors.fieldBorder }]}>
        {checked ? <Icon name="check" size={13} strokeWidth={iconStrokeWidth} color="#FFFFFF" /> : null}
      </View>
      <AppText size={14}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  box: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
