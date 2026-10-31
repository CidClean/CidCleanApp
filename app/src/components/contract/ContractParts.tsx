import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useTheme } from '@/theme';

/** Ficha llena de la muestra D-289: ámbar (warn), verde (ok) o neutra (CSA). */
export function Pill({ label, tone }: { label: string; tone: 'warn' | 'ok' | 'neutral' }) {
  const { colors } = useTheme();
  const bg = tone === 'warn' ? colors.attention : tone === 'ok' ? colors.brandSoft : colors.surface;
  const fg = tone === 'warn' ? colors.attentionText : tone === 'ok' ? colors.brandText : colors.secondary;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <AppText size={11} weight="heavy" color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Aviso ámbar (D-289): título en negrita y texto. */
export function AmberNote({ title, text }: { title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.amber, { backgroundColor: colors.attention }]}>
      <AppText size={13} color={colors.attentionText}>
        <AppText size={13} weight="heavy" color={colors.attentionText}>
          {title}
        </AppText>{' '}
        {text}
      </AppText>
    </View>
  );
}

/** Línea de pasos (D-289): punto verde hecho, crema pendiente. */
export function Steps({ labels, done }: { labels: string[]; done: number }) {
  const { colors, brand } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {labels.map((l, i) => (
        <View key={i} style={styles.step}>
          <View style={[styles.dot, { backgroundColor: i < done ? brand : colors.border }]} />
          <AppText size={13} style={{ flexShrink: 1 }}>
            {l}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  amber: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
