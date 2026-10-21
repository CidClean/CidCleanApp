import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { sample, useTheme } from '@/theme';

type Props = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  deleteLabel: string;
  /**
   * true (por defecto): la tecla de abajo a la izquierda es "Reenviar" (D-040, portal del quote).
   * false: queda vacía, sin texto ni acción (D-155, staff). Con true hacen falta onResend y resendLabel.
   */
  showResend?: boolean;
  onResend?: () => void;
  resendLabel?: string;
  resendDisabled?: boolean;
};

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

function Key({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.key, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      <AppText weight="medium" color={muted ? colors.secondary : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Teclado numérico propio con teclas Reenviar y Borrar (D-040). */
export function Keypad({
  onDigit,
  onDelete,
  deleteLabel,
  showResend = true,
  onResend,
  resendLabel,
  resendDisabled,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {DIGIT_ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => onDigit(d)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {showResend ? (
          <Key
            label={resendLabel ?? ''}
            onPress={resendDisabled || !onResend ? () => {} : onResend}
            muted={resendDisabled}
          />
        ) : (
          // Tecla vacía: misma forma y tamaño que las demás, sin texto ni acción (D-155).
          <View
            testID="keypad-empty-key"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.key, { backgroundColor: colors.surface }]}
          />
        )}
        <Key label="0" onPress={() => onDigit('0')} />
        <Key label={deleteLabel} onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: sample.keyGap, marginTop: 10 },
  row: { flexDirection: 'row', gap: sample.keyGap },
  key: {
    flex: 1,
    height: sample.keyHeight,
    borderRadius: sample.keyRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
