import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { radius, useTheme } from '@/theme';

type Props = { label: string; tone: 'brand' | 'success' | 'neutral' };

/**
 * Ficha de estado del lead (D-031, muestra ronda 8): 12px, relleno 2/10, radio 6 y borde de 1px.
 * De marca mientras el lead está abierto, verde Ganado y gris Perdido.
 * Equivale a Chip con el tono `brand` que agrega el hito 1; al integrar se puede cambiar por Chip.
 */
export function LeadStatusChip({ label, tone }: Props) {
  const { colors, status, brand } = useTheme();
  const border = tone === 'brand' ? brand : tone === 'success' ? status.success : colors.border;
  return (
    <View style={[styles.chip, { borderColor: border }]}>
      <AppText size={12}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingVertical: 2, paddingHorizontal: 10 },
});
