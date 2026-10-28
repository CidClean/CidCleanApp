import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Dialog } from '@/components/Dialog';
import { DialogButtons } from '@/components/work/SimpleParts';
import { getW9AdminStrings, type W9AdminStrings } from '@/i18n/w9';
import type { Locale } from '@/i18n';
import { formatDate } from '@/lib/employeeRules';
import { isEmail } from '@/lib/quoteRules';
import { fetchW9Status, resendW9, sendW9, type W9Status } from '@/lib/w9Api';
import { emptyW9, w9Errors, type W9Change, type W9Data, type W9Error } from '@/lib/w9Rules';
import { sample, useTheme } from '@/theme';

import { W9Fields } from './W9Fields';

/** "Cambió: nombre, dirección" con los campos que corrigió el empleado (D-255). */
export function changedText(t: W9AdminStrings, changes: readonly W9Change[]): string | null {
  if (changes.length === 0) return null;
  return t.changed(changes.map((c) => t.fields[c.field]).join(', '));
}

/**
 * W-9 por llenar en Documentos del perfil 1099 (D-175, D-256): botón "Enviar W-9 para llenar" que abre la ventana al
 * centro (D-229) con los datos prellenados, el estado "Enviado · vence {fecha}" con Reenviar y, cuando el empleado
 * firmó, la nota de lo que cambió (el W-9 de la fila pasa a Subido con el PDF).
 */
export function W9ProfileSection(props: {
  profileId: string;
  fullName: string;
  email: string | null;
  locale: Locale;
  /** El W-9 vigente del perfil (para mostrar "Cambió" solo si es el que firmó el empleado). */
  currentW9DocumentId: string | null;
  /** Se llama al enviar, para recargar los documentos. */
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const t = getW9AdminStrings(props.locale);
  const [status, setStatus] = useState<W9Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchW9Status(props.profileId);
    if (r.ok) setStatus(r.data);
  }, [props.profileId]);

  useEffect(() => {
    void load();
  }, [load, props.currentW9DocumentId]);

  async function resend() {
    if (!status || busy) return;
    setBusy(true);
    setNotice(null);
    const r = await resendW9(status.id);
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.errorSend });
    setNotice(r.data.sent ? { tone: 'ok', text: t.resent } : { tone: 'error', text: t.mailFailed });
    await load();
  }

  const open_ = status && status.status !== 'signed';
  const changes = status?.status === 'signed' && status.documentId === props.currentW9DocumentId ? changedText(t, status.changes) : null;

  return (
    <View style={{ marginTop: 4, gap: 6 }}>
      {open_ ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ flexShrink: 1 }}>
            {status.status === 'expired'
              ? t.expiredStatus(formatDate(status.expiresAt, props.locale))
              : t.sentStatus(formatDate(status.expiresAt, props.locale))}
          </AppText>
          <AppButton label={t.resend} variant="text" disabled={busy} onPress={() => void resend()} />
        </View>
      ) : null}
      {changes ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {changes}
        </AppText>
      ) : null}
      {notice ? (
        notice.tone === 'error' ? (
          <AppAlert tone="error" text={notice.text} />
        ) : (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {notice.text}
          </AppText>
        )
      ) : null}
      <AppButton label={t.sendToFill} variant="outline" icon="mail" onPress={() => {
        setNotice(null);
        setOpen(true);
      }} />
      <W9SendDialog
        visible={open}
        t={t}
        profileId={props.profileId}
        fullName={props.fullName}
        email={props.email ?? ''}
        onClose={() => setOpen(false)}
        onSent={async (sent, email) => {
          setOpen(false);
          setNotice(sent ? { tone: 'ok', text: t.sentTo(email) } : { tone: 'error', text: t.mailFailed });
          await load();
          props.onChanged?.();
        }}
      />
    </View>
  );
}

/** Ventana "Enviar W-9 a {nombre}" (muestra aprobada, D-256, D-257, D-258). */
export function W9SendDialog(props: {
  visible: boolean;
  t: W9AdminStrings;
  profileId: string;
  fullName: string;
  email: string;
  onClose: () => void;
  onSent: (sent: boolean, email: string) => void;
}) {
  const { t } = props;
  const [data, setData] = useState<W9Data>(() => emptyW9(props.fullName));
  const [email, setEmail] = useState(props.email);
  const [errors, setErrors] = useState<W9Error[]>([]);
  const [emailError, setEmailError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Cada vez que se abre parte del perfil (nombre y correo); lo demás lo llena quien envía.
  useEffect(() => {
    if (!props.visible) return;
    // Siempre del perfil actual: si se cambió el nombre o el correo, el W-9 toma el nuevo.
    setData((d) => ({ ...d, name: props.fullName }));
    setEmail(props.email);
    setErrors([]);
    setEmailError(false);
    setFailed(false);
  }, [props.visible, props.fullName, props.email]);

  async function send() {
    if (busy) return;
    const e = w9Errors(data);
    const badEmail = !isEmail(email);
    setErrors(e);
    setEmailError(badEmail);
    if (e.length > 0 || badEmail) return;
    setBusy(true);
    setFailed(false);
    const r = await sendW9(props.profileId, data, email);
    setBusy(false);
    if (!r.ok) return setFailed(true);
    props.onSent(r.data.sent, email.trim().toLowerCase());
  }

  const first = props.fullName.trim().split(/\s+/)[0] ?? props.fullName;
  return (
    <Dialog visible={props.visible} onClose={props.onClose}>
      <AppText weight="heavy" size={17} style={{ marginBottom: 8 }}>
        {t.dialogTitle(first)}
      </AppText>
      <W9Fields value={data} onChange={setData} t={t} errors={errors} />
      <AppField
        label={t.sendTo}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        error={emailError ? t.invalidEmail : null}
      />
      {failed ? <AppAlert tone="error" text={t.errorSend} /> : null}
      <View style={{ height: 4 }} />
      <DialogButtons cancel={t.cancel} save={t.send}
        onCancel={props.onClose} onSave={() => void send()} disabled={busy} />
    </Dialog>
  );
}
