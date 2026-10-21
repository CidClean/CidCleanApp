import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

type Props = {
  title: string;
  /** Línea gris de 13px bajo el título. */
  detail?: string;
  /** Flecha a la derecha (fila que abre algo). */
  chevron?: boolean;
  /** Elemento a la derecha (por ejemplo una ficha de estado). */
  right?: ReactNode;
  last?: boolean;
  onPress?: () => void;
};

/** Fila de lista de 48px con línea fina debajo (D-036, D-177). */
export function ListRow({ title, detail, chevron = false, right, last = false, onPress }: Props) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={styles.texts}>
        <AppText weight="medium">{title}</AppText>
        {detail !== undefined ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} /> : null}
    </>
  );
  const style = [styles.row, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/** Alto de toda fila de lista (D-177): 48px, con el borde dentro. Las filas de dos líneas caben con relleno de 4px. */
export const LIST_ROW_HEIGHT = 48;

export const rowStyles = StyleSheet.create({
  base: {
    minHeight: LIST_ROW_HEIGHT,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});

const styles = StyleSheet.create({
  row: rowStyles.base,
  texts: { flex: 1 },
});
