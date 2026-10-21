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
  last?: boolean;
  onPress?: () => void;
};

/** Fila de lista de 48px con línea fina debajo (clase `.vr` de las muestras aprobadas). */
export function ListRow({ title, detail, chevron = false, last = false, onPress }: Props) {
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

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  texts: { flex: 1 },
});
