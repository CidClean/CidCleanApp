import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = { value: boolean; onChange: (value: boolean) => void; accessibilityLabel: string; disabled?: boolean };

/** Interruptor de 40x24px (D-173): encendido en color de marca con la bolita blanca a la derecha. */
export function Switch({ value, onChange, accessibilityLabel, disabled = false }: Props) {
  const { colors, brand } = useTheme();
  const off = colors.switchOff;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      onPress={disabled ? undefined : () => onChange(!value)}
      style={[
        styles.track,
        value ? { backgroundColor: brand, borderColor: brand, justifyContent: 'flex-end' } : { borderColor: off },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: value ? '#FFFFFF' : off }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: { width: 18, height: 18, borderRadius: 9 },
});
