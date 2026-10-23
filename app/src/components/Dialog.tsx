import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { radius, useTheme } from '@/theme';

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

/**
 * Ventana al centro de la pantalla (D-220 c: Negociar o Rechazar del portal): fondo oscurecido al 40% como la hoja
 * (Sheet), tarjeta con el fondo de la pantalla, borde de 1px y esquinas de 12px (D-025), máximo 360px de ancho.
 */
export function Dialog({ visible, onClose, children }: Props) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="" style={styles.backdrop} onPress={onClose} />
      <View pointerEvents="box-none" style={styles.wrap}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 360, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 4 },
});
