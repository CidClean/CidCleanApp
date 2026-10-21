import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { useStrings } from '@/i18n/useStrings';
import { requestCode } from '@/lib/auth';
import { setPendingEmail } from '@/lib/pendingLogin';
import { useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pantalla del correo (D-149) y, si la sesión terminó, con el aviso ámbar arriba (D-151). */
export default function EmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, brand } = useTheme();
  const { ended } = useSession();
  const strings = useStrings();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (sending) return;
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalized)) {
      setError(strings.email.invalid);
      return;
    }
    setError(null);
    setSending(true);
    const result = await requestCode(normalized);
    setSending(false);
    if (!result.ok) {
      setError(result.reason === 'rate_limit' ? strings.email.errorRateLimit : strings.email.errorNetwork);
      return;
    }
    setPendingEmail(normalized);
    router.push('/code');
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        {ended ? <AppAlert text={strings.email.sessionEnded} /> : null}
        <AppText weight="medium" size={sample.titleSize} color={brand} center style={styles.title}>
          {strings.appName}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={styles.line}>
          {strings.email.prompt}
        </AppText>
        <AppField
          label={strings.email.label}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError(null);
          }}
          error={error}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        <AppButton label={strings.email.send} onPress={submit} disabled={sending} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 16 },
  column: { width: '100%', maxWidth: sample.screenMaxWidth, alignSelf: 'center' },
  title: { marginBottom: 4 },
  line: { marginBottom: 18 },
});
