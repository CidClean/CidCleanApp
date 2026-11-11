import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { CodeBoxes } from '@/components/CodeBoxes';
import { FormScroll } from '@/components/FormScroll';
import { useStrings } from '@/i18n/useStrings';
import { useCodeEntry } from '@/lib/codeEntry';
import { confirmTotp, findVerifiedFactor, groupSecret, readAal, startEnroll, type MfaFailure } from '@/lib/mfaFlow';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { sample, useTheme } from '@/theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'enroll'; factorId: string; qrSvg: string; secret: string }
  | { kind: 'verify'; factorId: string };

/**
 * Segundo paso del Super Admin (D-306), con el estilo de la pantalla del código (muestra ronda 13, D-040): sin factor,
 * QR + clave para copiar + código de 6 dígitos para confirmar; con factor, solo el código de 6 dígitos.
 */
export default function TwoStepScreen() {
  const insets = useSafeAreaInsets();
  const { colors, brand, status } = useTheme();
  const { refresh, signOut } = useSession();
  const strings = useStrings();
  const t = strings.twoStep;

  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const verifying = useRef(false);
  const resetRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    setStep({ kind: 'loading' });
    setError(null);
    const aal = await readAal(supabase);
    if (aal?.nextLevel === 'aal2') {
      const f = await findVerifiedFactor(supabase);
      if (f.ok) return setStep({ kind: 'verify', factorId: f.factorId });
    }
    const e = await startEnroll(supabase);
    setStep(e.ok ? { kind: 'enroll', factorId: e.factorId, qrSvg: e.qrSvg, secret: e.secret } : { kind: 'failed' });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const message = (reason: MfaFailure) =>
    reason === 'network' ? t.errorNetwork : reason === 'rate_limit' ? t.errorRateLimit : t.errorWrong;

  const verify = useCallback(
    async (code: string) => {
      if (verifying.current || (step.kind !== 'enroll' && step.kind !== 'verify')) return;
      verifying.current = true;
      setError(null);
      const r = await confirmTotp(supabase, step.factorId, code);
      if (r.ok) {
        await refresh(); // la sesión ya es aal2: el grupo (mfa) se cierra y la app sigue sola
        return;
      }
      verifying.current = false;
      setError(message(r.reason));
      resetRef.current();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, refresh, strings],
  );

  const entry = useCodeEntry(verify);
  resetRef.current = entry.reset;

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const title = step.kind === 'verify' ? t.verifyTitle : t.enrollTitle;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.bar, { backgroundColor: brand, paddingTop: insets.top + sample.barPaddingVertical }]}>
        <AppText weight="medium" size={sample.barTextSize} color="#FFFFFF">
          {t.barTitle}
        </AppText>
      </View>
      <FormScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {step.kind === 'loading' ? <BrandLoading label={strings.common.loading} /> : null}
          {step.kind === 'failed' ? (
            <>
              <AppText size={sample.noteSize} color={status.error} style={styles.error}>
                {t.errorStart}
              </AppText>
              <AppButton label={t.retry} onPress={() => void load()} />
            </>
          ) : null}
          {step.kind === 'enroll' || step.kind === 'verify' ? (
            <>
              <AppText weight="medium" size={sample.headingSize} accessibilityRole="header" style={styles.title}>
                {title}
              </AppText>
              <AppText size={sample.noteSize} color={colors.secondary}>
                {step.kind === 'verify' ? t.verifyNote : t.enrollNote}
              </AppText>
              {step.kind === 'enroll' ? (
                <View style={styles.enroll}>
                  <View style={styles.qr} accessibilityLabel={t.enrollTitle}>
                    <SvgXml xml={step.qrSvg} width={180} height={180} />
                  </View>
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {t.secretLabel}
                  </AppText>
                  <AppText weight="medium" selectable style={styles.secret}>
                    {groupSecret(step.secret)}
                  </AppText>
                  {Platform.OS === 'web' ? (
                    <AppButton variant="text" label={copied ? t.copied : t.copy} onPress={() => void copy(step.secret)} />
                  ) : null}
                </View>
              ) : null}
              <CodeBoxes
                value={entry.value}
                onChangeText={(text) => {
                  if (error) setError(null);
                  entry.onChangeText(text);
                }}
                inputRef={entry.inputRef}
                hasError={error !== null}
                accessibilityLabel={title}
              />
              {error ? (
                <AppText size={sample.noteSize} color={status.error} style={styles.error}>
                  {error}
                </AppText>
              ) : null}
            </>
          ) : null}
          <AppButton variant="text" label={t.signOut} onPress={() => void signOut()} />
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
  enroll: { marginTop: 12, gap: 6 },
  // El QR siempre sobre blanco (también en modo oscuro) para que la cámara lo lea.
  qr: { alignSelf: 'center', padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8 },
  secret: { letterSpacing: 1, marginBottom: 4 },
});
