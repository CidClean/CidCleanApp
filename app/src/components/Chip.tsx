import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, useTheme } from '@/theme';

type Props = { label: string; tone?: 'neutral' | 'success' | 'warning' };

/** Ficha de estado (muestras): 12px, relleno 2/10, radio 6, borde de 1px del color del estado. */
export function Chip({ label, tone = 'neutral' }: Props) {
  const { colors, status } = useTheme();
  const border = tone === 'success' ? status.success : tone === 'warning' ? status.warning : colors.border;
  return (
    <View style={[styles.chip, { borderColor: border }]}>
      <AppText size={12}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingVertical: 2, paddingHorizontal: 10 },
});
