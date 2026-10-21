import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, sample, useTheme } from '@/theme';

export const CODE_LENGTH = 6;

/** 6 casillas de 48px (D-040). La casilla actual lleva borde de marca de 2px, como en la muestra. */
export function CodeBoxes({ value, hasError = false }: { value: string; hasError?: boolean }) {
  const { colors, brand, status } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={value}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const current = i === value.length;
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                borderColor: hasError ? status.error : current ? brand : colors.fieldBorder,
                borderWidth: current && !hasError ? 2 : 1,
              },
            ]}
          >
            <AppText weight="medium" size={sample.codeBoxSize}>
              {value[i] ?? ''}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sample.codeBoxGap, marginVertical: 8 },
  box: {
    flex: 1,
    height: sample.codeBoxHeight,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
