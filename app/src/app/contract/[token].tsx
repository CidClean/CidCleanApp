import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { CodeBoxes } from '@/components/CodeBoxes';
import { FormScroll } from '@/components/FormScroll';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { TitleHeader } from '@/components/bento/Header';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { BrandMark } from '@/components/brand/BrandMark';
import { showDone } from '@/components/brand/DoneOverlay';
import { Pill } from '@/components/contract/ContractParts';
import { CONTRACT_PORTAL as t } from '@/i18n/contract';
import { CODE_LENGTH } from '@/lib/codeEntry';
import {
  contractFileUrl,
  contractPortalData,
  contractPortalState,
  contractRequestCode,
  contractSign,
  contractVerifyCode,
  readContractSession,
  saveContractSession,
  type ContractPortalData,
  type ContractPortalState,
} from '@/lib/contractApi';
import { isEmail } from '@/lib/quoteRules';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'closed'; state: ContractPortalState }
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'sign' }
  | { kind: 'done' };

/**
 * Portal de firma del contrato en quote.cidclean.com/contract/<link> (D-283, diseño D-289), solo en inglés: correo →
 * código de 6 dígitos (como el W-9) → "Commercial Service Agreement" con el número CSA, "Read the agreement and SOW
 * (PDF)", Full name, Title, la casilla de firma electrónica y "Sign agreement" con la animación Listo (D-250).
 */
export default function ContractPortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [data, setData] = useState<ContractPortalData | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const codeRef = useRef(null);

  async function openSession(s: string): Promise<boolean> {
    const r = await contractPortalData(s);
    if (!r.ok) {
      saveContractSession(token, null);
      setSession(null);
      return false;
    }
    setSession(s);
    setData(r.data);
    if (r.data.status !== 'sent') setStep({ kind: 'closed', state: 'signed' });
    else setStep({ kind: 'sign' });
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await contractPortalState(token);
      if (cancelled) return;
      if (!st.ok) return setStep({ kind: 'closed', state: 'not_found' });
      if (st.data.state !== 'open') return setStep({ kind: 'closed', state: st.data.state });
      const saved = readContractSession(token);
      if (saved && (await openSession(saved))) return;
      if (!cancelled) setStep({ kind: 'email' });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function sendCode() {
    if (busy) return;
    if (!isEmail(email)) return setNotice(t.invalidEmail);
    setBusy(true);
    setNotice(null);
    const r = await contractRequestCode(token, email.trim().toLowerCase());
    setBusy(false);
    if (r.ok) {
      setCode('');
      setStep({ kind: 'code' });
      return;
    }
    if (r.reason === 'closed') setStep({ kind: 'closed', state: 'expired' });
    else setNotice(r.reason === 'rate_limited' ? t.rateLimited : r.reason === 'network' ? t.network : t.error);
  }

  async function checkCode(value: string) {
    setCode(value);
    if (value.length < CODE_LENGTH || busy) return;
    setBusy(true);
    setNotice(null);
    const r = await contractVerifyCode(token, email.trim().toLowerCase(), value);
    if (r.ok) {
      saveContractSession(token, r.data.session);
      await openSession(r.data.session);
      setBusy(false);
      return;
    }
    setBusy(false);
    setCode('');
    if (r.reason === 'closed') setStep({ kind: 'closed', state: 'expired' });
    else setNotice(r.reason === 'locked' ? t.locked : r.reason === 'network' ? t.network : t.wrongCode);
  }

  async function readPdf() {
    if (!session || busy) return;
    setBusy(true);
    const r = await contractFileUrl(session);
    setBusy(false);
    if (!r.ok) return setSignError(r.reason === 'network' ? t.network : t.error);
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(r.data.url, '_blank', 'noopener');
    else void Linking.openURL(r.data.url);
  }

  async function sign() {
    if (!session || busy) return;
    if (!name.trim() || !title.trim()) return setSignError(t.needNameTitle);
    if (!agreed) return setSignError(t.needAgree);
    setBusy(true);
    setSignError(null);
    const r = await contractSign(session, name.trim(), title.trim());
    if (!r.ok) {
      // La respuesta pudo perderse aunque la firma quedó: se revisa antes de mostrar un error.
      const again = await contractPortalData(session);
      setBusy(false);
      if (again.ok && again.data.status !== 'sent') {
        setStep({ kind: 'done' });
        showDone();
        return;
      }
      if (r.reason === 'session') return setStep({ kind: 'email' });
      if (r.reason === 'closed') return setStep({ kind: 'closed', state: 'expired' });
      return setSignError(r.reason === 'network' ? t.network : t.error);
    }
    setBusy(false);
    saveContractSession(token, null);
    setStep({ kind: 'done' });
    showDone(); // D-250: "Listo" al firmar
  }

  const shell = (header: string, body: React.ReactNode, onBack?: () => void) => (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {onBack ? <TopBar title={header} onBack={onBack} backLabel={t.back} /> : <TitleHeader title={header} left={<BrandMark />} />}
      <FormScroll contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {notice ? <AppAlert tone="error" text={notice} /> : null}
          {body}
        </View>
      </FormScroll>
    </View>
  );

  if (step.kind === 'loading')
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BrandLoading label={t.loading} />
      </View>
    );
  if (step.kind === 'closed') {
    const [h, b] =
      step.state === 'signed' ? [t.signedTitle, t.signedBody]
        : step.state === 'expired' || step.state === 'closed' ? [t.expiredTitle, t.expiredBody]
          : [t.notFoundTitle, t.notFoundBody];
    return shell(t.brand, <Result ok={step.state === 'signed'} title={h} body={b} />);
  }
  if (step.kind === 'done') return shell(t.brand, <Result ok title={t.doneTitle} body={t.doneBody} />);

  if (step.kind === 'email')
    return shell(
      t.brand,
      <View>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
          {t.emailTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {t.emailNote}
        </AppText>
        <AppField label={t.email} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          autoCorrect={false} autoComplete="email" onSubmitEditing={() => void sendCode()} />
        <View style={{ height: 4 }} />
        <AppButton label={t.sendCode} onPress={() => void sendCode()} disabled={busy} />
      </View>,
    );

  if (step.kind === 'code')
    return shell(
      t.brand,
      <View>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
          {t.codeTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary}>
          {t.codeNote}
        </AppText>
        <CodeBoxes value={code} onChangeText={(v) => void checkCode(v.replace(/\D/g, ''))} inputRef={codeRef} disabled={busy}
          accessibilityLabel={t.codeTitle} />
        <AppButton label={t.resendCode} variant="text" onPress={() => void sendCode()} disabled={busy} />
      </View>,
      () => setStep({ kind: 'email' }),
    );

  if (!data) return null;
  // Firma (muestra aprobada D-289, paso 2).
  return shell(
    t.title,
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <AppText weight="bold" size={14} style={{ flexShrink: 1 }}>
          {data.company}
        </AppText>
        <Pill label={data.csa} tone="neutral" />
      </View>
      <AppButton label={t.readPdf} variant="outline" icon="file-text" onPress={() => void readPdf()} disabled={busy} />
      <AppField label={t.fullName} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" maxLength={120} />
      <AppField label={t.jobTitle} value={title} onChangeText={setTitle} autoCapitalize="words" maxLength={120} />
      <Checkbox label={data.consent_text} checked={agreed} onChange={setAgreed} />
      {signError ? <AppAlert tone="error" text={signError} /> : null}
      <AppButton label={t.sign} onPress={() => void sign()} disabled={busy} />
    </View>,
  );
}

function Result({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  const { status, colors } = useTheme();
  const c = ok ? status.success : colors.secondary;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.ok, { borderColor: c }]}>
        <Icon name={ok ? 'check' : 'alert-triangle'} size={28} strokeWidth={iconStrokeWidth} color={c} />
      </View>
      <AppText weight="medium" size={sample.headingSize} center>
        {title}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 12, alignItems: 'center' },
  column: { width: '100%', maxWidth: sample.screenMaxWidth - 24 },
  card: { borderRadius: radius.card - 4, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ok: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
});
