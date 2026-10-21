import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from '@/theme';

type Props<T extends string> = {
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
};

/** Pestañas del perfil (D-057, muestra ronda 15 `.tabs`): 13px, la activa en color de texto con línea de 2px de marca. */
export function Tabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={[styles.tab, on ? { borderBottomColor: brand, borderBottomWidth: 2 } : null]}
          >
            <AppText size={13} weight={on ? 'medium' : 'regular'} color={on ? colors.text : colors.secondary}>
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 0.5, marginBottom: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 10 },
});
