import { StyleSheet, View } from 'react-native';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Dialog } from './Dialog';
import { useStrings } from '@/i18n/useStrings';
import { useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Confirmación de Cerrar sesión (D-222 a, reemplaza D-167 en la forma): ventana al centro con "¿Cerrar sesión?",
 * "Tendrás que pedir un código para volver a entrar." y Cancelar / Cerrar sesión (sólido). La usan el Menú y Mi perfil.
 */
export function SignOutDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const { signOut } = useSession();
  return (
    <Dialog visible={visible} onClose={onClose}>
      <View style={{ paddingVertical: 8 }}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
          {strings.profile.confirmTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {strings.profile.confirmBody}
        </AppText>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <AppButton label={strings.profile.cancel} variant="outline" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={strings.profile.signOut}
              onPress={() => {
                onClose();
                void signOut();
              }}
            />
          </View>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
