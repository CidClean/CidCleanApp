import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useTheme } from '@/theme';

export type Stat = { value: number; label: string; tone: 'plain' | 'attention' | 'brand' };

/** Fila de cifras pequeñas (D-226, como el Pipeline): tarjetas de 20px con la cifra en 22px/800 y su nombre. */
export function StatRow({ stats }: { stats: readonly Stat[] }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.row}>
      {stats.map((st) => {
        const bg = st.tone === 'brand' ? brand : st.tone === 'attention' ? colors.attention : colors.card;
        const fg = st.tone === 'brand' ? '#FFFFFF' : colors.text;
        const sub = st.tone === 'brand' ? '#FFFFFF' : st.tone === 'attention' ? colors.attentionText : colors.secondary;
        return (
          <View key={st.label} style={[styles.stat, { backgroundColor: bg }]}>
            <AppText weight="heavy" size={22} color={fg}>
              {String(st.value)}
            </AppText>
            <AppText size={12} color={sub} style={st.tone === 'brand' ? { opacity: 0.85 } : undefined}>
              {st.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, borderRadius: 20, padding: 12, gap: 2 },
});
