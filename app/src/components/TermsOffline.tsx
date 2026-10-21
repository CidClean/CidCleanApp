import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { TopBar } from './TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * "Antes de empezar" sin conexión (D-179, muestra ronda 15): quien debe aceptar los términos y no puede revisarlos
 * no entra a la app hasta que haya conexión. "Reintentar" vuelve a comprobar.
 */
export function TermsOffline() {
  const { colors } = useTheme();
  const strings = useStrings();
  const { refresh } = useSession();
  const [checking, setChecking] = useState(false);

  async function retry() {
    if (checking) return;
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.terms.barTitle} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.icon}>
          <Icon name="alert-triangle" size={34} strokeWidth={iconStrokeWidth} color={colors.secondary} />
        </View>
        <AppText weight="medium" size={sample.headingSize} center>
          {strings.terms.offlineTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={styles.note}>
          {strings.terms.offlineBody}
        </AppText>
        <AppButton label={strings.terms.retry} onPress={() => void retry()} disabled={checking} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 12, paddingVertical: 26 },
  icon: { alignItems: 'center', marginBottom: 8 },
  note: { marginTop: 4, marginBottom: 14 },
});
