import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

export type CardTone = 'plain' | 'brand' | 'attention' | 'dark';

type Props = {
  tone?: CardTone;
  /** Ocupa las dos columnas del mosaico. */
  wide?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Tarjeta del estilo C (D-223): blanca (plain), de marca #0F766E con texto blanco (brand), de atención ámbar claro
 * #FBE3C7 (attention) u oscura #1E2A28 (dark); esquinas de 24px, relleno de 16px.
 */
export function Card({ tone = 'plain', wide = false, onPress, accessibilityLabel, style, children }: Props) {
  const { colors, brand } = useTheme();
  const bg = tone === 'brand' ? brand : tone === 'attention' ? colors.attention : tone === 'dark' ? colors.darkCard : colors.card;
  const box = [styles.card, { backgroundColor: bg }, wide ? styles.wide : styles.half, style];
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={box}>
        {children}
      </Pressable>
    );
  return <View style={box}>{children}</View>;
}

/** Texto de cada tono de tarjeta: principal y secundario. */
export function useCardText(tone: CardTone): { main: string; soft: string; softOpacity: number } {
  const { colors } = useTheme();
  if (tone === 'brand') return { main: '#FFFFFF', soft: '#FFFFFF', softOpacity: 0.85 };
  if (tone === 'dark') return { main: colors.darkCardText, soft: colors.darkCardText, softOpacity: 0.75 };
  if (tone === 'attention') return { main: colors.text, soft: colors.attentionText, softOpacity: 1 };
  return { main: colors.text, soft: colors.secondary, softOpacity: 1 };
}

/** Mosaico de 2 columnas con 12px de separación (D-223). */
export function Bento({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Bloque de lista sobre una tarjeta blanca de 24px (las listas de las demás pantallas, D-223). */
export function CardBlock({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.block, { backgroundColor: colors.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderRadius: radius.card, padding: 16, overflow: 'hidden' },
  wide: { width: '100%' },
  // Dos por fila: la mitad menos la mitad de la separación de 12px.
  half: { flexBasis: '46%', flexGrow: 1 },
  block: { borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
});
