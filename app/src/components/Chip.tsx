import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, useTheme } from '@/theme';

type Props = { label: string; tone?: 'neutral' | 'success' | 'warning' | 'brand' | 'muted'; medium?: boolean };

/** Ficha de estado (muestras): 12px, relleno 2/10, radio 6, borde de 1px del color del estado (brand = Todo, success = Parcial, muted = Sin acceso, ronda 16). */
export function Chip({ label, tone = 'neutral', medium = false }: Props) {
  const { colors, status, brand } = useTheme();
  const border =
    tone === 'success'
      ? status.success
      : tone === 'warning'
        ? status.warning
        : tone === 'brand'
          ? brand
          : tone === 'muted'
            ? colors.secondary
            : colors.border;
  return (
    <View style={[styles.chip, { borderColor: border }]}>
      <AppText size={12} weight={medium ? 'medium' : 'regular'}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingVertical: 2, paddingHorizontal: 10 },
});
