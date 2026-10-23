import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

/** Hoja inferior de las confirmaciones (muestra ronda 15 `.sheet`): fondo de la pantalla, borde de 0.5px, radio 16 y relleno de 12px. */
export function Sheet({ visible, onClose, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="" style={styles.backdrop} onPress={onClose} />
      <View pointerEvents="box-none" style={styles.wrap}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 12 + insets.bottom },
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderTopWidth: 0.5,
    borderTopLeftRadius: 24, // D-223
    borderTopRightRadius: 24,
    padding: 16,
  },
});
