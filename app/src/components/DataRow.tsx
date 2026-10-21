import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { rowStyles } from './ListRow';
import { sample, useTheme } from '@/theme';

type Props = {
  label: string;
  value: string;
  /** Ficha u otro elemento a la derecha. */
  right?: ReactNode;
  last?: boolean;
  onPress?: () => void;
};

/** Fila de datos del perfil (muestra ronda 15 `.vr`): etiqueta gris de 13px arriba, valor de 15px en medio peso, alto 48px (D-177). */
export function DataRow({ label, value, right, last = false, onPress }: Props) {
  const { colors } = useTheme();
  const style = [rowStyles.base, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }];
  const content = (
    <>
      <View style={{ flex: 1 }}>
        <AppText size={sample.noteSize} color={colors.secondary}>
          {label}
        </AppText>
        <AppText weight="medium">{value}</AppText>
      </View>
      {right}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
