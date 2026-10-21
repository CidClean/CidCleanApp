import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, useTheme } from '@/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
};

/** Control segmentado (muestra ronda 15 `.seg`): borde de 1px, radio 12, opción activa en color de marca. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.seg, { borderColor: colors.fieldBorder }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.item, on ? { backgroundColor: brand } : null]}
          >
            <AppText weight={on ? 'medium' : 'regular'} size={14} color={on ? '#FFFFFF' : colors.text} center>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.control, overflow: 'hidden', marginBottom: 8 },
  item: { flex: 1, paddingVertical: 8, alignItems: 'center' },
});
