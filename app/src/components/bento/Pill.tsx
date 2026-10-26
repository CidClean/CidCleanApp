import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useTheme } from '@/theme';

/**
 * Ficha rellena del mosaico (muestra D-253 `.chip`): 11px/800, esquinas redondas; `ok` en verde suave de marca
 * (#DDEFEC con texto #0F766E) y `warn` en ámbar (#FBE3C7 con texto #8A4B0F).
 */
export function Pill({ label, tone }: { label: string; tone: 'ok' | 'warn' }) {
  const { colors } = useTheme();
  const bg = tone === 'ok' ? colors.brandSoft : colors.attention;
  const fg = tone === 'ok' ? colors.brandText : colors.attentionText;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <AppText size={11} weight="heavy" color={fg}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
});
