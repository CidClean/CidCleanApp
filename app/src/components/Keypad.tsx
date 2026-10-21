import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { sample, useTheme } from '@/theme';

type Props = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onResend: () => void;
  resendLabel: string;
  deleteLabel: string;
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
export function Keypad({ onDigit, onDelete, onResend, resendLabel, deleteLabel, resendDisabled }: Props) {
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
        <Key label={resendLabel} onPress={resendDisabled ? () => {} : onResend} muted={resendDisabled} />
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
