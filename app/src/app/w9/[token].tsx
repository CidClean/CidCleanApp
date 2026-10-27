import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { CodeBoxes } from '@/components/CodeBoxes';
import { Dialog } from '@/components/Dialog';
import { FormScroll } from '@/components/FormScroll';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { TopBar } from '@/components/TopBar';
import { TitleHeader } from '@/components/bento/Header';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { BrandMark } from '@/components/brand/BrandMark';
import { showDone } from '@/components/brand/DoneOverlay';
import { DialogButtons } from '@/components/work/SimpleParts';
import { W9AddressFields, W9ClassificationFields, W9MoreOptions, w9ErrorText } from '@/components/w9/W9Fields';
import {
  CERTIFICATION_EN,
  CERTIFICATION_ES_HELP,
  getW9AdminStrings,
  getW9PortalStrings,
  type W9PortalStrings,
} from '@/i18n/w9';
import { CODE_LENGTH } from '@/lib/codeEntry';
import { isEmail } from '@/lib/quoteRules';
import {
  readW9Session,
  saveW9Session,
  w9Data,
  w9Preview,
  w9RequestCode,
  w9Sign,
  w9State,
  w9VerifyCode,
  type W9PortalState,
} from '@/lib/w9Api';
import {
  addressText,
  classificationText,
  formatTin,
  tinDigits,
  tinValid,
  w9Errors,
  type TinType,
  type W9Data,
  type W9Error,
} from '@/lib/w9Rules';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'closed'; state: W9PortalState }
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'review' }
  | { kind: 'sign' }
  | { kind: 'done' };

type EditKey = 'name' | 'business' | 'classification' | 'address';

/** Fecha de hoy como la muestra aprobada: "Oct 27, 2026" / "27 oct 2026". */
function today(l: 'es' | 'en'): string {
  const d = new Date();
  const es = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return l === 'es' ? `${d.getDate()} ${es[d.getMonth()]} ${d.getFullYear()}` : `${en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Portal del W-9 en quote.cidclean.com/w9/<link> (D-255, D-256, D-257, D-258), en el idioma del perfil del empleado:
 * correo → código de 6 dígitos → revisar y corregir los datos (con Más opciones) → elegir SSN, ITIN o EIN y escribir
 * el número con máscara → certificación de la Parte II → nombre escrito como firma con la casilla → "Sign and submit"
 * con la animación Listo (D-250) → listo. El número vive solo en esta pantalla hasta firmar; no se guarda en el
 * navegador.
 */
export default function W9PortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors, brand } = useTheme();
  const [lang, setLang] = useState<'es' | 'en'>('en');
  const t = getW9PortalStrings(lang);
  const f = getW9AdminStrings(lang);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [data, setData] = useState<W9Data | null>(null);
  const [errors, setErrors] = useState<W9Error[]>([]);
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [tinType, setTinType] = useState<TinType>('ssn');
  // El número: solo en la memoria de esta pantalla (nunca en sessionStorage ni en el servidor salvo al firmar).
  const [tin, setTin] = useState('');
  const [tinError, setTinError] = useState(false);
  const [signer, setSigner] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const codeRef = useRef(null);

  async function openSession(s: string): Promise<boolean> {
    const r = await w9Data(s);
    if (!r.ok) {
      saveW9Session(token, null);
      setSession(null);
      return false;
    }
    setLang(r.data.language);
    setSession(s);
    if (r.data.status === 'signed') {
      setStep({ kind: 'closed', state: 'signed' });
      return true;
    }
    if (r.data.status !== 'open') {
      setStep({ kind: 'closed', state: r.data.status });
      return true;
    }
    setData(r.data.data);
    setStep({ kind: 'review' });
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await w9State(token);
      if (cancelled) return;
      if (!st.ok) return setStep({ kind: 'closed', state: 'not_found' });
      setLang(st.data.language);
      if (st.data.state !== 'open') return setStep({ kind: 'closed', state: st.data.state });
      const saved = readW9Session(token);
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
    const r = await w9RequestCode(token, email.trim().toLowerCase());
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
    const r = await w9VerifyCode(token, email.trim().toLowerCase(), value);
    if (r.ok) {
      saveW9Session(token, r.data.session);
      await openSession(r.data.session);
      setBusy(false);
      return;
    }
    setBusy(false);
    setCode('');
    if (r.reason === 'closed') setStep({ kind: 'closed', state: 'expired' });
    else setNotice(r.reason === 'locked' ? t.locked : r.reason === 'network' ? t.network : t.wrongCode);
  }

  function toSign() {
    if (!data) return;
    const e = w9Errors(data);
    const badTin = !tinValid(tinType, tin);
    setErrors(e);
    setTinError(badTin);
    if (e.length > 0 || badTin) return;
    setSignError(null);
    setStep({ kind: 'sign' });
  }

  async function preview() {
    if (!session || !data || busy) return;
    setBusy(true);
    setSignError(null);
    const r = await w9Preview(session, data);
    setBusy(false);
    if (!r.ok) return setSignError(r.reason === 'network' ? t.network : t.error);
    // Se abre aparte como el PDF del quote (D-041); el archivo no se guarda.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const bytes = Uint8Array.from(atob(r.data.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  async function sign() {
    if (!session || !data || busy) return;
    if (!signer.trim()) return setSignError(t.needName);
    if (!agreed) return setSignError(t.needAgree);
    setBusy(true);
    setSignError(null);
    const r = await w9Sign(session, { data, tinType, tin, signerName: signer.trim(), agreed });
    if (!r.ok) {
      // La respuesta pudo perderse aunque la firma quedó: se revisa antes de mostrar un error.
      const again = await w9Data(session);
      setBusy(false);
      if (again.ok && again.data.status === 'signed') {
        setTin('');
        setStep({ kind: 'done' });
        showDone();
        return;
      }
      if (r.reason === 'session') {
        setStep({ kind: 'email' });
        return;
      }
      if (r.reason === 'invalid_tin') {
        setTinError(true);
        setStep({ kind: 'review' });
        return;
      }
      setSignError(r.reason === 'network' ? t.network : t.error);
      return;
    }
    setTin('');
    setBusy(false);
    setStep({ kind: 'done' });
    showDone(); // D-250: "Listo" al firmar
  }

  const shell = (title: string, body: React.ReactNode, onBack?: () => void) => (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {onBack || title !== t.brand ? (
        <TopBar title={title} onBack={onBack} backLabel={t.back} />
      ) : (
        <TitleHeader title={title} left={<BrandMark />} />
      )}
      <FormScroll contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {onBack || title !== t.brand ? <BrandMark size={32} /> : null}
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
  if (step.kind === 'closed') return shell(t.brand, <Closed state={step.state} t={t} />);

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

  if (step.kind === 'done')
    return shell(
      t.brand,
      <View style={{ alignItems: 'center' }}>
        <ResultIcon ok />
        <AppText weight="medium" size={sample.headingSize} center>
          {t.doneTitle}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
          {t.doneBody}
        </AppText>
      </View>,
    );

  if (!data) return null;

  if (step.kind === 'sign')
    return shell(
      t.signTitle,
      <SignStep
        t={t}
        lang={lang}
        signer={signer}
        agreed={agreed}
        error={signError}
        busy={busy}
        onSigner={setSigner}
        onAgreed={setAgreed}
        onSign={() => void sign()}
        onPreview={() => void preview()}
      />,
      () => setStep({ kind: 'review' }),
    );

  // Revisar y corregir (muestra aprobada, paso 3).
  const rows: [EditKey, string, string][] = [
    ['name', t.name, data.name],
    ['business', t.business, data.business || '—'],
    ['classification', t.classification, classificationText(data)],
    ['address', t.address, addressText(data)],
  ];
  const fieldError = (k: EditKey) =>
    k === 'name' ? errors.includes('name') : k === 'classification' ? errors.some((e) => e === 'llc' || e === 'other')
      : k === 'address' ? errors.some((e) => e === 'address' || e === 'city') : false;
  return shell(
    t.yourW9,
    <View>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
        {t.reviewNote}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {rows.map(([k, label, value], i) => (
          <View key={k} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <AppText size={12} color={fieldError(k) ? undefined : colors.secondary}>
                {label}
              </AppText>
              <AppText size={14}>{value}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t.edit} ${label}`} onPress={() => setEditing(k)} style={styles.edit}>
              <Icon name="pencil" size={16} strokeWidth={iconStrokeWidth} color={colors.text} />
              <AppText size={13} weight="medium">
                {t.edit}
              </AppText>
            </Pressable>
          </View>
        ))}
      </View>
      {rows.some(([k]) => fieldError(k)) ? <AppAlert tone="error" text={errors.map((e) => w9ErrorText(f, errors, e)).filter(Boolean)[0] as string} /> : null}
      <W9MoreOptions value={data} onChange={setData} t={f} errors={errors} />
      <View style={{ marginTop: 8 }}>
        <Segmented<TinType>
          options={[
            { value: 'ssn', label: t.tinSsn },
            { value: 'itin', label: t.tinItin },
            { value: 'ein', label: t.tinEin },
          ]}
          value={tinType}
          onChange={(v) => {
            setTinType(v);
            setTinError(false);
          }}
        />
      </View>
      <TinField type={tinType} value={tin} onChange={(v) => {
        setTin(v);
        setTinError(false);
      }} label={t.tinLabel[tinType]} error={tinError ? t.badTin[tinType] : null} showLabel={t.tinShow} hideLabel={t.tinHide} />
      <View style={[styles.lock, { backgroundColor: colors.brandSoft }]}>
        <Icon name="lock" size={14} strokeWidth={iconStrokeWidth} color={brand} />
        <AppText size={12} weight="bold" color={brand} style={{ flexShrink: 1 }}>
          {t.tinLock}
        </AppText>
      </View>
      <AppButton label={t.continue} onPress={toSign} />
      <EditDialog
        editing={editing}
        data={data}
        t={t}
        lang={lang}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          setData(next);
          setErrors(w9Errors(next).filter((e) => errors.includes(e)));
          setEditing(null);
        }}
      />
    </View>,
  );
}

/** Campo del número con máscara: mientras se escribe 123-45-6789; fuera del campo •••-••-6789 (muestra aprobada). */
/** D-259: el número se ve oculto (puntos) mientras se escribe; el ojo lo muestra u oculta. Empieza oculto. */
function TinField(props: {
  type: TinType;
  value: string;
  onChange: (v: string) => void;
  label: string;
  error: string | null;
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  return (
    <AppField
      label={props.label}
      value={visible ? formatTin(props.type, props.value) : props.value}
      onChangeText={(v) => props.onChange(tinDigits(v))}
      secureTextEntry={!visible}
      keyboardType="number-pad"
      autoComplete="off"
      autoCorrect={false}
      importantForAutofill="no"
      textContentType="none"
      maxLength={visible ? 11 : 9}
      error={props.error}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? props.hideLabel : props.showLabel}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={{ paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={20} strokeWidth={iconStrokeWidth} color={colors.secondary} />
        </Pressable>
      }
    />
  );
}

/** Ventana al centro para corregir un dato (D-229). */
function EditDialog(props: {
  editing: EditKey | null;
  data: W9Data;
  t: W9PortalStrings;
  lang: 'es' | 'en';
  onClose: () => void;
  onSave: (d: W9Data) => void;
}) {
  const f = getW9AdminStrings(props.lang);
  const [draft, setDraft] = useState<W9Data>(props.data);
  const [errors, setErrors] = useState<W9Error[]>([]);
  useEffect(() => {
    if (props.editing) {
      setDraft(props.data);
      setErrors([]);
    }
  }, [props.editing, props.data]);
  const title =
    props.editing === 'name' ? props.t.name : props.editing === 'business' ? props.t.business
      : props.editing === 'classification' ? props.t.classification : props.t.address;
  function save() {
    const relevant: Record<EditKey, W9Error[]> = { name: ['name', 'long'], business: ['long'], classification: ['llc', 'other'], address: ['address', 'city', 'long'] };
    const e = w9Errors(draft).filter((x) => props.editing && relevant[props.editing].includes(x));
    setErrors(e);
    if (e.length === 0) props.onSave(draft);
  }
  return (
    <Dialog visible={props.editing !== null} onClose={props.onClose}>
      <AppText weight="heavy" size={17} style={{ marginBottom: 8 }}>
        {title}
      </AppText>
      {props.editing === 'name' ? (
        <AppField label={f.line1} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} maxLength={120}
          autoCapitalize="words" error={w9ErrorText(f, errors, 'name')} />
      ) : null}
      {props.editing === 'business' ? (
        <AppField label={f.line2} value={draft.business} onChangeText={(v) => setDraft({ ...draft, business: v })} maxLength={120} />
      ) : null}
      {props.editing === 'classification' ? <W9ClassificationFields value={draft} onChange={setDraft} t={f} errors={errors} /> : null}
      {props.editing === 'address' ? <W9AddressFields value={draft} onChange={setDraft} t={f} errors={errors} /> : null}
      <DialogButtons cancel={props.t.cancel} save={props.t.save} onCancel={props.onClose} onSave={save} />
    </Dialog>
  );
}

/** Firma (muestra aprobada, paso 4): certificación de la Parte II, nombre escrito, casilla, fecha y botones. */
function SignStep(props: {
  t: W9PortalStrings;
  lang: 'es' | 'en';
  signer: string;
  agreed: boolean;
  error: string | null;
  busy: boolean;
  onSigner: (v: string) => void;
  onAgreed: (v: boolean) => void;
  onSign: () => void;
  onPreview: () => void;
}) {
  const { colors } = useTheme();
  const { t } = props;
  const [all, setAll] = useState(false);
  const shown = all ? CERTIFICATION_EN : CERTIFICATION_EN.slice(0, 5);
  return (
    <View>
      <View style={[styles.card, { backgroundColor: colors.card, gap: 4 }]}>
        {shown.map((p, i) => (
          <AppText key={i} size={12.5} numberOfLines={all ? undefined : 2} style={{ lineHeight: 18 }}>
            {p}
          </AppText>
        ))}
        {all && props.lang === 'es' ? (
          <View style={{ marginTop: 8, gap: 4 }}>
            <AppText size={12} weight="medium" color={colors.secondary}>
              {t.helpTranslation}
            </AppText>
            {CERTIFICATION_ES_HELP.map((p, i) => (
              <AppText key={i} size={12} color={colors.secondary} style={{ lineHeight: 17 }}>
                {p}
              </AppText>
            ))}
          </View>
        ) : null}
        <AppButton label={all ? t.showLess : t.readAll} variant="text" onPress={() => setAll(!all)} />
      </View>
      <AppField label={t.typeName} value={props.signer} onChangeText={props.onSigner} autoCapitalize="words" autoComplete="name" maxLength={120} />
      {props.signer.trim() ? (
        <AppText size={24} style={[styles.sig, { color: colors.text }]}>
          {props.signer.trim()}
        </AppText>
      ) : null}
      <Checkbox label={t.agree} checked={props.agreed} onChange={props.onAgreed} />
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
        {t.dateNote(today(props.lang))}
      </AppText>
      {props.error ? <AppAlert tone="error" text={props.error} /> : null}
      <AppButton label={t.signSubmit} onPress={props.onSign} disabled={props.busy} />
      <View style={{ height: 8 }} />
      <AppButton label={t.preview} variant="outline" icon="file-text" onPress={props.onPreview} disabled={props.busy} />
      <AppText size={12} color={colors.secondary} center style={{ marginTop: 4 }}>
        {t.previewNote}
      </AppText>
    </View>
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

function Closed({ state, t }: { state: W9PortalState; t: W9PortalStrings }) {
  const { colors } = useTheme();
  const [title, body] =
    state === 'signed' ? [t.signedTitle, t.signedBody]
      : state === 'expired' ? [t.expiredTitle, t.expiredBody]
        : state === 'replaced' ? [t.replacedTitle, t.replacedBody]
          : [t.notFoundTitle, t.notFoundBody];
  return (
    <View style={{ alignItems: 'center' }}>
      <ResultIcon ok={state === 'signed'} />
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
  card: { borderRadius: radius.card, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 },
  sig: { fontFamily: Platform.select({ web: '"Brush Script MT","Segoe Script",cursive', default: undefined }), fontStyle: 'italic', marginTop: -2, marginBottom: 8 },
  ok: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
});
