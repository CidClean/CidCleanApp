import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { radius, useTheme } from '@/theme';

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

/**
 * Ventana al centro de la pantalla (D-220 c, D-229): la única forma de las ventanas de la app (desplegables, fecha y
 * hora, confirmaciones, Subir documento, Nota de la foto, Negociar o Rechazar). Fondo oscurecido al 40%, tarjeta
 * con el fondo de las tarjetas, esquinas de 24px, ancho máximo de 360px con 16px de margen, y desplazamiento por
 * dentro si el contenido es largo. Se sube con el teclado si tiene campos.
 */
export function Dialog({ visible, onClose, children }: Props) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="" style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none" style={styles.wrap}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: height * 0.85 }]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 360, borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  content: { padding: 16 },
});
