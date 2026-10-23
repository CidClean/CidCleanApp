import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { CodeBoxes } from '@/components/CodeBoxes';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { QuoteView } from '@/components/quotes/QuoteView';
import { getPortalStrings, type PortalStrings } from '@/i18n/quotes';
import { CODE_LENGTH } from '@/lib/codeEntry';
import {
  decide,
  fetchPortalQuote,
  portalFileUrl,
  portalState,
  readPortalSession,
  requestCode,
  savePortalSession,
  verifyCode,
  type PortalQuote,
  type PortalState,
} from '@/lib/portalApi';
import { dateTime, isEmail, money } from '@/lib/quoteRules';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'closed'; state: PortalState }
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'quote' }
  | { kind: 'decision' }
  | { kind: 'accept' }
  | { kind: 'reason'; decision: 'rejected' | 'changes_requested' }
  | { kind: 'done'; decision: 'accepted' | 'rejected' | 'changes_requested' };

/**
 * Portal del cliente en quote.cidclean.com/q/<enlace> (D-041 a D-047, D-094, D-095, D-129, D-208, D-209), en el
 * idioma del lead: correo → código de 6 dígitos con el teclado del teléfono → cotización → leer el SOW → decisión.
 */
export default function PortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const [lang, setLang] = useState<'es' | 'en'>('en');
  const t = getPortalStrings(lang);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [quote, setQuote] = useState<PortalQuote | null>(null);
  const codeRef = useRef(null);

  const loadQuote = useCallback(
    async (s: string) => {
      const r = await fetchPortalQuote(s);
      if (!r.ok) {
        savePortalSession(token, null);
        setSession(null);
        return false;
      }
      setQuote(r.data);
      setLang(r.data.language);
      return true;
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await portalState(token);
      if (cancelled) return;
      if (!st.ok) {
        setStep({ kind: 'closed', state: 'not_found' });
        return;
      }
      setLang(st.data.language);
      if (st.data.state !== 'open') {
        setStep({ kind: 'closed', state: st.data.state });
        return;
      }
      const saved = readPortalSession(token);
      if (saved && (await loadQuote(saved))) {
        setSession(saved);
        setStep({ kind: 'quote' });
        return;
      }
      setStep({ kind: 'email' });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadQuote]);

  async function sendCode() {
    if (busy) return;
    if (!isEmail(email)) {
      setNotice(t.invalidEmail);
      return;
    }
    setBusy(true);
    setNotice(null);
    const r = await requestCode(token, email.trim().toLowerCase());
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
    const r = await verifyCode(token, email.trim().toLowerCase(), value);
    if (r.ok) {
      savePortalSession(token, r.data.session);
      setSession(r.data.session);
      await loadQuote(r.data.session);
      setBusy(false);
      setStep({ kind: 'quote' });
      return;
    }
    setBusy(false);
    setCode('');
    if (r.reason === 'closed') setStep({ kind: 'closed', state: 'expired' });
    else setNotice(r.reason === 'locked' ? t.locked : r.reason === 'network' ? t.network : t.wrongCode);
  }

  async function openFile(kind: 'sow' | 'pdf' | 'terms') {
    if (!session) return;
    const r = await portalFileUrl(session, kind);
    if (!r.ok) {
      setNotice(r.reason === 'session' ? null : t.error);
      if (r.reason === 'session') setStep({ kind: 'email' });
      return;
    }
    // D-041: el PDF se abre aparte; no se dibuja dentro de la página.
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(r.data.url, '_blank', 'noopener');
    else await Linking.openURL(r.data.url);
    if (kind === 'sow') await loadQuote(session);
  }

  async function submit(d: { kind: 'accepted' | 'rejected' | 'changes_requested'; name?: string; title?: string; reason_id?: string | null; note?: string; read_confirmed?: boolean }) {
    if (!session || busy) return;
    setBusy(true);
    setNotice(null);
    const r = await decide(session, d);
    setBusy(false);
    if (!r.ok) {
      if (r.reason === 'session') setStep({ kind: 'email' });
      else setNotice(r.reason === 'network' ? t.network : t.error);
      return;
    }
    await loadQuote(session);
    setStep({ kind: 'done', decision: d.kind });
  }

  const shell = (title: string, body: React.ReactNode, onBack?: () => void, bottom?: React.ReactNode) => (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={title} onBack={onBack} backLabel={lang === 'es' ? 'Volver' : 'Back'} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {notice ? <AppAlert tone="error" text={notice} /> : null}
          {body}
        </View>
      </ScrollView>
      {bottom}
    </KeyboardAvoidingView>
  );

  if (step.kind === 'loading') return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (step.kind === 'closed') return shell(t.brand, <ClosedState state={step.state} t={t} />);

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
        <AppField
          label={t.email}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          onSubmitEditing={() => void sendCode()}
        />
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
        <CodeBoxes value={code} onChangeText={(v) => void checkCode(v.replace(/\D/g, ''))} inputRef={codeRef} disabled={busy} accessibilityLabel={t.codeTitle} />
        <AppButton label={t.resend} variant="text" onPress={() => void sendCode()} disabled={busy} />
      </View>,
      () => setStep({ kind: 'email' }),
    );

  if (!quote) return null;
  const view = {
    company: quote.company,
    site: quote.site,
    address: quote.address,
    frequency: quote.frequency,
    lines: quote.lines,
    taxRate: Number(quote.tax_rate),
    subtotal: Number(quote.subtotal),
    discount: Number(quote.discount),
    tax: Number(quote.tax),
    total: Number(quote.total),
    expiresAt: quote.expires_at,
    validDays: 0,
  };

  if (step.kind === 'quote')
    return shell(
      t.yourQuote,
      <View>
        <QuoteView data={view} t={t} language={lang} />
        <View style={{ gap: 8, marginTop: 14 }}>
          <AppButton label={t.readSow} variant="outline" icon="file-text" onPress={() => void openFile('sow')} />
          <AppButton label={t.downloadQuote} variant="text" onPress={() => void openFile('pdf')} />
          {quote.sow_opened ? (
            <AppButton label={t.continue} onPress={() => setStep({ kind: 'decision' })} />
          ) : (
            <View>
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {t.sowLocked}
              </AppText>
              <AppButton label={t.continue} icon="lock" disabled onPress={() => undefined} />
            </View>
          )}
        </View>
      </View>,
    );

  if (step.kind === 'decision')
    return (
      <DecisionStep
        t={t}
        lang={lang}
        quote={quote}
        shell={shell}
        onBack={() => setStep({ kind: 'quote' })}
        onAccept={() => setStep({ kind: 'accept' })}
        onReason={(decision) => setStep({ kind: 'reason', decision })}
      />
    );

  if (step.kind === 'accept')
    return <AcceptStep t={t} quote={quote} shell={shell} busy={busy} onBack={() => setStep({ kind: 'decision' })} onTerms={() => void openFile('terms')} onSubmit={(name, title, ok) => void submit({ kind: 'accepted', name, title, read_confirmed: ok })} />;

  if (step.kind === 'reason')
    return (
      <ReasonStep
        t={t}
        quote={quote}
        decision={step.decision}
        shell={shell}
        busy={busy}
        onBack={() => setStep({ kind: 'decision' })}
        onSubmit={(reason, note) => void submit({ kind: step.decision, reason_id: reason, note })}
      />
    );

  return shell(t.brand, <DoneState t={t} lang={lang} quote={quote} decision={step.decision} />);
}

type Shell = (title: string, body: React.ReactNode, onBack?: () => void, bottom?: React.ReactNode) => React.ReactElement;

/** Decisión (D-044, D-094): total con tax, barra fija con Más opciones (Negociar, Rechazar) y Aceptar cotización. */
function DecisionStep({
  t,
  quote,
  shell,
  onBack,
  onAccept,
  onReason,
}: {
  t: PortalStrings;
  lang: 'es' | 'en';
  quote: PortalQuote;
  shell: Shell;
  onBack: () => void;
  onAccept: () => void;
  onReason: (d: 'rejected' | 'changes_requested') => void;
}) {
  const { colors, brand } = useTheme();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const bar = (
    <View style={[styles.fix, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 10 + insets.bottom }]}>
      <View style={styles.column}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.moreOptions}
            onPress={() => setMenu(true)}
            style={[styles.dots, { borderColor: brand }]}
          >
            <Icon name="dots" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppButton label={t.accept} onPress={onAccept} />
          </View>
        </View>
      </View>
    </View>
  );
  return (
    <>
      {shell(
        t.decisionTitle,
        <View>
          <AppText size={sample.noteSize}>{t.totalWithTax}</AppText>
          <AppText weight="medium" size={sample.titleSize} style={{ lineHeight: 31 }}>
            {money(Number(quote.total))}
          </AppText>
        </View>,
        onBack,
        bar,
      )}
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        {(
          [
            ['changes_requested', t.negotiate, t.negotiateHint],
            ['rejected', t.reject, t.rejectHint],
          ] as const
        ).map(([kind, title, hint], i) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              onReason(kind);
            }}
            style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: i === 0 ? 0.5 : 0 }]}
          >
            <AppText weight="medium">{title}</AppText>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {hint}
            </AppText>
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/** Aceptación (D-045, D-095): resumen, Nombre completo, Cargo, casilla de lectura y Aceptar cotización. */
function AcceptStep({
  t,
  quote,
  shell,
  busy,
  onBack,
  onTerms,
  onSubmit,
}: {
  t: PortalStrings;
  quote: PortalQuote;
  shell: Shell;
  busy: boolean;
  onBack: () => void;
  onTerms: () => void;
  onSubmit: (name: string, title: string, confirmed: boolean) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasTerms = quote.terms_version !== null;
  function go() {
    if (!name.trim() || !title.trim()) return setError(t.needNameTitle);
    if (!ok) return setError(t.needConfirm);
    setError(null);
    onSubmit(name.trim(), title.trim(), ok);
  }
  return shell(
    t.accept,
    <View>
      <View style={[styles.card, { borderColor: colors.fieldBorder }]}>
        <AppText size={sample.noteSize} color={colors.secondary}>
          {quote.company} · {quote.site}
        </AppText>
        <View style={styles.cardLine}>
          <AppText size={14}>{t.total}</AppText>
          <AppText size={14} weight="medium">
            {money(Number(quote.total))}
          </AppText>
        </View>
      </View>
      <AppField label={t.fullName} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />
      <AppField label={t.jobTitle} value={title} onChangeText={setTitle} autoCapitalize="sentences" />
      <View style={{ marginTop: 4 }}>
        <Checkbox label={hasTerms ? t.confirmRead : t.confirmReadSowOnly} checked={ok} onChange={setOk} />
      </View>
      {hasTerms ? <AppButton label={t.readTerms} variant="text" onPress={onTerms} /> : null}
      {error ? <AppAlert tone="error" text={error} /> : null}
      <AppButton label={t.accept} onPress={go} disabled={busy} />
    </View>,
    onBack,
  );
}

/** Rechazo o negociación (D-046, D-108): motivos en fichas, en el idioma del lead, y Nota (opcional). */
function ReasonStep({
  t,
  quote,
  decision,
  shell,
  busy,
  onBack,
  onSubmit,
}: {
  t: PortalStrings;
  quote: PortalQuote;
  decision: 'rejected' | 'changes_requested';
  shell: Shell;
  busy: boolean;
  onBack: () => void;
  onSubmit: (reason: string | null, note: string) => void;
}) {
  const { colors, brand } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  function go() {
    if (decision === 'rejected' && !reason) return setError(t.needReason);
    if (decision === 'changes_requested' && !reason && !note.trim()) return setError(t.needReasonOrNote);
    setError(null);
    onSubmit(reason, note.trim());
  }
  return shell(
    decision === 'rejected' ? t.rejectTitle : t.negotiateTitle,
    <View>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
        {t.whichReason}
      </AppText>
      <View style={styles.chips}>
        {quote.reasons.map((r) => {
          const on = r.id === reason;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setReason(on ? null : r.id)}
              style={[styles.chip, on ? { backgroundColor: brand, borderColor: brand } : { borderColor: colors.border }]}
            >
              <AppText size={12} color={on ? '#FFFFFF' : colors.text}>
                {r.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppField label={t.noteOptional} value={note} onChangeText={setNote} multiline textAlignVertical="top" style={{ minHeight: 80 }} />
      {error ? <AppAlert tone="error" text={error} /> : null}
      <AppButton label={t.submit} onPress={go} disabled={busy} />
    </View>,
    onBack,
  );
}

function ResultIcon({ ok }: { ok: boolean }) {
  const { status, colors } = useTheme();
  const c = ok ? status.success : colors.secondary;
  return (
    <View style={[styles.ok, { borderColor: c }]}>
      <Icon name={ok ? 'check' : 'alert-triangle'} size={28} strokeWidth={iconStrokeWidth} color={c} />
    </View>
  );
}

/** Pantalla final (D-047): marca de éxito y tarjeta con sitio, versión, fecha y hora y nombre. */
function DoneState({ t, lang, quote, decision }: { t: PortalStrings; lang: 'es' | 'en'; quote: PortalQuote; decision: 'accepted' | 'rejected' | 'changes_requested' }) {
  const { colors } = useTheme();
  if (decision !== 'accepted') {
    return (
      <View style={{ alignItems: 'center' }}>
        <ResultIcon ok />
        <AppText weight="medium" size={sample.headingSize} center>
          {decision === 'rejected' ? t.rejectedTitle : t.changesTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
          {decision === 'rejected' ? t.rejectedBody : t.changesBody}
        </AppText>
      </View>
    );
  }
  const rows: [string, string][] = [
    [t.site, quote.site],
    [t.version, quote.version],
    [t.acceptedAt, dateTime(quote.decision?.at ?? new Date().toISOString(), lang)],
    [t.by, quote.decision?.name ?? ''],
  ];
  return (
    <View>
      <View style={{ alignItems: 'center' }}>
        <ResultIcon ok />
        <AppText weight="medium" size={sample.headingSize} center style={{ marginBottom: 10 }}>
          {t.acceptedTitle}
        </AppText>
      </View>
      <View style={[styles.card, { borderColor: colors.fieldBorder, marginBottom: 0 }]}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}>
            <AppText size={14}>{k}</AppText>
            <AppText size={14} weight="medium">
              {v}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ClosedState({ state, t }: { state: PortalState; t: PortalStrings }) {
  const { colors } = useTheme();
  const [title, body] =
    state === 'expired'
      ? [t.expiredTitle, t.expiredBody]
      : state === 'superseded'
        ? [t.supersededTitle, t.supersededBody]
        : state === 'changes_requested'
          ? [t.changesTitle, t.changesBody]
          : state === 'decided'
            ? [t.decidedTitle, t.decidedBody]
            : [t.notFoundTitle, t.notFoundBody];
  return (
    <View style={{ alignItems: 'center' }}>
      <ResultIcon ok={state === 'changes_requested'} />
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
  fix: { borderTopWidth: 0.5, paddingTop: 10, paddingHorizontal: 12, alignItems: 'center' },
  dots: { width: 44, minHeight: sample.buttonMinHeight, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  menuRow: { paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: radius.control, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  cardLine: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingVertical: 2, paddingHorizontal: 10 },
  ok: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
});
