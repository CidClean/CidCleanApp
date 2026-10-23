import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/FormScroll';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { CodeBoxes } from '@/components/CodeBoxes';
import { useStrings } from '@/i18n/useStrings';
import { requestCode, verifyCode } from '@/lib/auth';
import { useCodeEntry } from '@/lib/codeEntry';
import { getPendingEmail } from '@/lib/pendingLogin';
import { useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/** Enfriamiento del reenvío, en segundos (decisión técnica, no de diseño). */
const RESEND_COOLDOWN_SECONDS = 30;

/** Pantalla del código (D-040) con el mensaje neutro de D-150. */
export default function CodeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, brand, status } = useTheme();
  const { refresh } = useSession();
  const strings = useStrings();

  const email = getPendingEmail();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // El código acaba de pedirse en la pantalla anterior, así que el enfriamiento empieza ya.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const verifying = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // `verify` necesita `reset` y `reset` viene de useCodeEntry, que necesita `verify`: se une con una referencia.
  const resetRef = useRef<() => void>(() => {});

  const verify = useCallback(
    async (code: string) => {
      if (!email || verifying.current) return;
      verifying.current = true;
      setBusy(true);
      setError(null);
      const result = await verifyCode(email, code);
      if (result.ok) {
        await refresh(); // el grupo (auth) se protege y la app pasa sola al grupo (app)
        return;
      }
      verifying.current = false;
      setBusy(false);
      setError(
        result.reason === 'network'
          ? strings.code.errorNetwork
          : result.reason === 'rate_limit'
            ? strings.code.errorRateLimit
            : strings.code.errorWrong,
      );
      resetRef.current(); // limpia las casillas y devuelve el foco
    },
    [email, refresh, strings],
  );

  const entry = useCodeEntry(verify);
  resetRef.current = entry.reset;

  async function onResend() {
    if (!email || cooldown > 0 || busy) return;
    setError(null);
    entry.reset();
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const result = await requestCode(email);
    if (!result.ok) {
      setCooldown(0);
      setError(result.reason === 'rate_limit' ? strings.code.errorRateLimit : strings.code.errorNetwork);
    }
  }

  // Sin correo pendiente (por ejemplo, al recargar esta pantalla) se vuelve a la del correo.
  if (!email) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.bar, { backgroundColor: brand, paddingTop: insets.top + sample.barPaddingVertical }]}>
        <AppText weight="medium" size={sample.barTextSize} color="#FFFFFF">
          {strings.code.barTitle}
        </AppText>
      </View>
      <FormScroll
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <AppText weight="medium" size={sample.headingSize} accessibilityRole="header" style={styles.title}>
            {strings.code.title}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary}>
            {strings.code.note}
          </AppText>
          <CodeBoxes
            value={entry.value}
            onChangeText={(text) => {
              if (error) setError(null);
              entry.onChangeText(text);
            }}
            inputRef={entry.inputRef}
            hasError={error !== null}
            accessibilityLabel={strings.code.title}
          />
          {error ? (
            <AppText size={sample.noteSize} color={status.error} style={styles.error}>
              {error}
            </AppText>
          ) : null}
          <AppButton
            variant="text"
            label={strings.code.resend}
            onPress={onResend}
            disabled={cooldown > 0}
          />
        </View>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingBottom: sample.barPaddingVertical },
  content: { flexGrow: 1, padding: 12 },
  column: { width: '100%', maxWidth: sample.screenMaxWidth, alignSelf: 'center' },
  title: { marginTop: 6, marginBottom: 4 },
  error: { marginBottom: 4 },
});
