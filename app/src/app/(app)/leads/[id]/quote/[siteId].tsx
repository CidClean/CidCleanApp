import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Segmented } from '@/components/Segmented';
import { Switch } from '@/components/Switch';
import { TopBar } from '@/components/TopBar';
import { QuoteView } from '@/components/quotes/QuoteView';
import { getPortalStrings } from '@/i18n/quotes';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchLead } from '@/lib/leadsApi';
import type { Lead } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import {
  cleanRecipients,
  computeTotals,
  dateTime,
  discountAmount,
  formatAmountInput,
  isEmail,
  money,
  parseAmount,
  quoteActions,
  shortDate,
  statusTone,
  validateLines,
  type QuoteLines,
  type QuoteVersion,
  type SiteQuote,
} from '@/lib/quoteRules';
import {
  ensureQuote,
  fetchSiteQuote,
  fetchSuggestions,
  newQuoteVersion,
  saveQuoteDraft,
  sendQuote,
  uploadQuoteSow,
  type Suggestions,
} from '@/lib/quotesApi';
import { usePermissions, useSession } from '@/lib/session';
import { choosePdf } from '@/lib/termsApi';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Draft = { lines: QuoteLines; amounts: Record<string, string>; taxRate: string; validDays: string; recipients: string[] };

function draftFrom(v: QuoteVersion): Draft {
  const amounts: Record<string, string> = {};
  (['services', 'addons'] as const).forEach((sec) => v.lines[sec].forEach((l, i) => (amounts[`${sec}.${i}`] = formatAmountInput(l.amount))));
  v.lines.discounts.forEach((d, i) => (amounts[`discounts.${i}`] = formatAmountInput(d.value)));
  return { lines: v.lines, amounts, taxRate: String(v.taxRate), validDays: String(v.validDays), recipients: v.recipients };
}

/**
 * Quote de un sitio (D-077, D-208, D-209): el borrador se arma aquí (Servicios, Add-ons y Descuentos con Gravable,
 * tax, vigencia, destinatarios y SOW obligatorio) con Vista previa, Guardar borrador y Enviar; enviado, se ven su
 * estado, la decisión del cliente, el PDF, el SOW y las versiones anteriores.
 */
export default function SiteQuoteScreen() {
  const { id: leadId, siteId } = useLocalSearchParams<{ id: string; siteId: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const q = useQuoteStrings();
  const strings = useStrings();
  const { locale } = useSession();
  const { can } = usePermissions();
  const canSee = can('quotes_ver') || can('quotes_editar') || can('quotes_enviar');
  const canEdit = can('quotes_editar') && can('quotes_ver_precios');
  const canSend = can('quotes_enviar');
  const canSow = can('sow_contratos_subir_ver');

  const [lead, setLead] = useState<Lead | null>(null);
  const [data, setData] = useState<SiteQuote | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [suggest, setSuggest] = useState<Suggestions>({ services: [], addons: [], discounts: [] });
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning' | 'ok'; text: string } | null>(null);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([fetchLead(leadId), fetchSiteQuote(siteId)]);
    if (l.ok) setLead(l.data);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    let result = r.data;
    // Sin quote y con el walkthrough cerrado: quien arma quotes empieza el borrador 1.0 al entrar.
    if (!result.quoteId && result.walkthroughClosed && canEdit) {
      const e = await ensureQuote(siteId);
      if (e.ok) {
        const again = await fetchSiteQuote(siteId);
        if (again.ok) result = again.data;
      }
    }
    setFailed(false);
    setData(result);
    const latest = result.versions[0];
    setDraft(latest && latest.status === 'draft' ? draftFrom(latest) : null);
  }, [leadId, siteId, canEdit]);

  useEffect(() => {
    void load();
    if (canEdit) void fetchSuggestions().then(setSuggest);
  }, [load, canEdit]);

  const latest = data?.versions[0] ?? null;
  const site = lead?.sites.find((s) => s.id === siteId);
  const siteName = site ? (site.name?.trim() ? site.name : site.address) : '';
  const actions = quoteActions(latest, { edit: canEdit, send: canSend });
  const totals = useMemo(() => (draft ? computeTotals(draft.lines, Number(draft.taxRate) || 0) : null), [draft]);
  const errors = draft ? validateLines(draft.lines) : null;

  if (!canSee) return <Redirect href="/" />;

  function setLines(lines: QuoteLines, amounts?: Record<string, string>) {
    if (!draft) return;
    setDraft({ ...draft, lines, amounts: amounts ?? draft.amounts });
  }

  function addLine(sec: keyof QuoteLines, label = '') {
    if (!draft) return;
    const lines = { ...draft.lines };
    if (sec === 'discounts') lines.discounts = [...lines.discounts, { label, kind: 'amount', value: null }];
    else lines[sec] = [...lines[sec], { label, amount: null, taxable: true }];
    setLines(lines);
  }

  function removeLine(sec: keyof QuoteLines, i: number) {
    if (!draft) return;
    const lines = { ...draft.lines, [sec]: draft.lines[sec].filter((_, j) => j !== i) } as QuoteLines;
    // Los montos escritos se reordenan con los renglones.
    const amounts: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft.amounts)) {
      const [s, n] = k.split('.');
      const idx = Number(n);
      if (s !== sec) amounts[k] = v;
      else if (idx < i) amounts[k] = v;
      else if (idx > i) amounts[`${s}.${idx - 1}`] = v;
    }
    setLines(lines, amounts);
  }

  function setAmount(sec: keyof QuoteLines, i: number, text: string) {
    if (!draft) return;
    const lines = { ...draft.lines };
    const value = parseAmount(text);
    if (sec === 'discounts') lines.discounts = lines.discounts.map((d, j) => (j === i ? { ...d, value } : d));
    else lines[sec] = lines[sec].map((l, j) => (j === i ? { ...l, amount: value } : l));
    setLines(lines, { ...draft.amounts, [`${sec}.${i}`]: text });
  }

  async function save(): Promise<boolean> {
    if (!draft || !latest) return false;
    const tax = Number(draft.taxRate);
    const days = Number(draft.validDays);
    if (errors?.lines.size || !(tax >= 0 && tax <= 100) || !(days >= 1 && days <= 365)) {
      setShowErrors(true);
      return false;
    }
    const r = await saveQuoteDraft(latest.id, {
      lines: draft.lines,
      taxRate: tax,
      validDays: days,
      recipients: cleanRecipients(draft.recipients, latest.contactEmail),
    });
    if (!r.ok) {
      setNotice({ tone: 'error', text: q.errorSave });
      return false;
    }
    return true;
  }

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const ok = await save();
    if (ok) {
      await load();
      setNotice({ tone: 'ok', text: q.saved });
    }
    setBusy(false);
  }

  async function onSend() {
    if (busy || !latest || !draft) return;
    setShowErrors(true);
    if (errors?.noService || errors?.lines.size || !latest.hasSow || (!latest.contactEmail && draft.recipients.length === 0)) return;
    setBusy(true);
    setNotice(null);
    if (!(await save())) {
      setBusy(false);
      return;
    }
    const r = await sendQuote(latest.id);
    if (!r.ok) {
      setNotice({ tone: 'error', text: q.errorSend });
      setBusy(false);
      await load();
      return;
    }
    await load();
    setNotice(r.data.failed > 0 ? { tone: 'warning', text: q.sentMailFailed } : { tone: 'ok', text: q.sentOk(r.data.sent) });
    setBusy(false);
  }

  async function onResend() {
    if (busy || !latest) return;
    setBusy(true);
    const r = await sendQuote(latest.id, true);
    setBusy(false);
    setNotice(!r.ok || r.data.failed > 0 ? { tone: 'error', text: q.errorSend } : { tone: 'ok', text: q.sentOk(r.data.sent) });
  }

  async function onNewVersion() {
    if (busy || !data?.quoteId) return;
    setBusy(true);
    const r = await newQuoteVersion(data.quoteId);
    if (!r.ok) setNotice({ tone: 'error', text: q.errorSave });
    await load();
    setBusy(false);
  }

  async function onUploadSow() {
    if (busy || !latest || !data?.quoteId) return;
    const picked = await choosePdf();
    if (picked.kind !== 'picked') return;
    setBusy(true);
    setNotice(null);
    // Antes de subir se guarda lo escrito, para no perderlo al recargar.
    if (draft) await save();
    const r = await uploadQuoteSow(data.quoteId, latest.id, picked.file);
    if (!r.ok) setNotice({ tone: 'error', text: q.errorUpload });
    await load();
    setBusy(false);
  }

  function openFile(path: string, title: string) {
    router.push({ pathname: '/viewer', params: { source: 'quote-file', path, title } });
  }

  function addEmail() {
    if (!draft) return;
    if (!isEmail(newEmail)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setDraft({ ...draft, recipients: cleanRecipients([...draft.recipients, newEmail], latest?.contactEmail ?? null) });
    setNewEmail('');
  }

  const title = q.siteQuote(siteName);

  // Vista previa: lo que verá el cliente, en el idioma del lead (D-209).
  if (preview && draft && totals && latest) {
    const pl = lead?.language ?? 'en';
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TopBar title={q.previewTitle} onBack={() => setPreview(false)} backLabel={q.preview} />
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <QuoteView
            t={getPortalStrings(pl)}
            language={pl}
            data={{
              company: lead?.company ?? '',
              site: siteName,
              address: data?.address || site?.address || '',
              frequency: data?.frequency ?? null,
              lines: draft.lines,
              taxRate: Number(draft.taxRate) || 0,
              ...totals,
              expiresAt: null,
              validDays: Number(draft.validDays) || 30,
            }}
          />
        </ScrollView>
      </View>
    );
  }

  const bottomBar =
    actions.edit && draft ? (
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 10 + insets.bottom }]}>
        <View style={styles.flex}>
          <AppButton label={q.saveDraft} variant="outline" onPress={() => void onSave()} disabled={busy} />
        </View>
        {actions.send ? (
          <View style={styles.flex}>
            <AppButton label={q.send} onPress={() => void onSend()} disabled={busy} />
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {failed ? <AppAlert tone="error" text={q.errorLoad} /> : null}
        {notice ? (
          notice.tone === 'ok' ? (
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
              {notice.text}
            </AppText>
          ) : (
            <AppAlert tone={notice.tone} text={notice.text} />
          )
        ) : null}
        {data && !data.quoteId ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {data.walkthroughClosed ? q.noQuoteYet : q.needWalkthrough}
          </AppText>
        ) : null}
        {latest ? (
          <View style={[styles.header, { backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: 12 }]}>
            <AppText weight="medium" size={sample.headingSize}>
              {q.version(latest.version)}
            </AppText>
            <Chip label={q.status[latest.status]} tone={statusTone(latest.status)} />
          </View>
        ) : null}

        {latest && draft && actions.edit ? (
          <Builder
            q={q}
            draft={draft}
            setDraft={setDraft}
            suggest={suggest}
            showErrors={showErrors}
            errors={errors}
            addLine={addLine}
            removeLine={removeLine}
            setAmount={setAmount}
          />
        ) : null}

        {latest && draft && actions.edit && totals ? (
          <View>
            <View style={styles.twoCols}>
              <View style={styles.flex}>
                <AppField
                  label={q.taxRate}
                  value={draft.taxRate}
                  onChangeText={(v) => setDraft({ ...draft, taxRate: v })}
                  keyboardType="decimal-pad"
                  error={showErrors && !(Number(draft.taxRate) >= 0 && Number(draft.taxRate) <= 100) ? q.percentError : null}
                />
              </View>
              <View style={styles.flex}>
                <AppField
                  label={q.validDays}
                  value={draft.validDays}
                  onChangeText={(v) => setDraft({ ...draft, validDays: v.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Totals q={q} totals={totals} taxRate={draft.taxRate} />

            <AppText size={sample.labelSize} color={colors.secondary} style={styles.sectionLabel}>
              {q.recipients}
            </AppText>
            {latest.contactEmail ? (
              <ListRow title={q.contactEmail(latest.contactEmail)} last={draft.recipients.length === 0} />
            ) : (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 6 }}>
                {q.noContactEmail}
              </AppText>
            )}
            {draft.recipients.map((e, i) => (
              <ListRow
                key={e}
                title={e}
                last={i === draft.recipients.length - 1}
                right={
                  <Pressable accessibilityRole="button" accessibilityLabel={q.removeEmail(e)} hitSlop={8}
                    onPress={() => setDraft({ ...draft, recipients: draft.recipients.filter((x) => x !== e) })}>
                    <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                  </Pressable>
                }
              />
            ))}
            <View style={[styles.twoCols, { alignItems: 'flex-end', marginTop: 8 }]}>
              <View style={styles.flex}>
                <AppField
                  label={q.extraEmail}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError ? q.emailError : null}
                  onSubmitEditing={addEmail}
                />
              </View>
              <View style={{ width: 110, marginBottom: emailError ? 26 : 8 }}>
                <AppButton label={q.add} variant="outline" onPress={addEmail} />
              </View>
            </View>
            {showErrors && !latest.contactEmail && draft.recipients.length === 0 ? <AppAlert tone="error" text={q.noContactEmail} /> : null}

            <AppText size={sample.labelSize} color={colors.secondary} style={styles.sectionLabel}>
              {q.sow}
            </AppText>
            {latest.hasSow && latest.sowPath ? (
              <ListRow title={q.readSow} chevron last onPress={() => openFile(latest.sowPath as string, q.sow)} />
            ) : (
              <AppText size={sample.noteSize} color={showErrors ? colors.text : colors.secondary} style={{ marginBottom: 8 }}>
                {q.sowRequired}
              </AppText>
            )}
            {canSow ? (
              <View style={{ marginTop: 8 }}>
                <AppButton label={latest.hasSow ? q.replaceSow : q.uploadSow} variant="outline" icon="upload" onPress={() => void onUploadSow()} disabled={busy} />
              </View>
            ) : null}
            <View style={{ marginTop: 12 }}>
              <AppButton label={q.preview} variant="text" onPress={() => setPreview(true)} />
            </View>
          </View>
        ) : null}

        {latest && !actions.edit && latest.status !== 'draft' ? (
          <SentVersion q={q} v={latest} locale={locale} onFile={openFile} />
        ) : null}
        {latest && latest.status === 'draft' && !actions.edit ? (
          <SentVersion q={q} v={latest} locale={locale} onFile={openFile} />
        ) : null}

        {latest && (actions.resend || actions.newVersion) ? (
          <View style={{ gap: 8, marginTop: 12 }}>
            {actions.resend ? <AppButton label={q.resend} variant="outline" onPress={() => void onResend()} disabled={busy} /> : null}
            {actions.newVersion ? (
              <AppButton label={latest.status === 'expired' ? q.renew : q.newVersion} onPress={() => void onNewVersion()} disabled={busy} />
            ) : null}
          </View>
        ) : null}

        {data && data.versions.length > 1 ? (
          <View style={{ marginTop: 14 }}>
            <AppText size={sample.labelSize} color={colors.secondary} style={styles.sectionLabel}>
              {q.previousVersions}
            </AppText>
            {data.versions.slice(1).map((v, i, rows) => (
              <ListRow
                key={v.id}
                title={q.version(v.version)}
                detail={v.sentAt ? q.sentOn(shortDate(v.sentAt, locale)) : undefined}
                right={<Chip label={q.status[v.status]} tone={statusTone(v.status)} />}
                last={i === rows.length - 1}
                onPress={v.pdfPath ? () => openFile(v.pdfPath as string, q.version(v.version)) : undefined}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
      {bottomBar}
    </KeyboardAvoidingView>
  );
}

function Totals({ q, totals, taxRate }: { q: ReturnType<typeof useQuoteStrings>; totals: { subtotal: number; discount: number; tax: number; total: number }; taxRate: string }) {
  const { colors } = useTheme();
  const rows: [string, string, boolean][] = [[q.subtotal, money(totals.subtotal), false]];
  if (totals.discount > 0) rows.push([q.discounts, '−' + money(totals.discount), false]);
  rows.push([q.taxOnTaxable(taxRate || '0'), money(totals.tax), false]);
  rows.push([q.total, money(totals.total), true]);
  return (
    <View style={{ marginTop: 4, marginBottom: 4 }}>
      {rows.map(([k, v, strong], i) => (
        <View key={k} style={[styles.ln, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}>
          <AppText size={14} weight={strong ? 'medium' : 'regular'}>
            {k}
          </AppText>
          <AppText size={14} weight="medium">
            {v}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Armado (D-077): tres secciones; cada renglón con nombre, monto y Gravable (descuentos: Monto o %), papelera y sugerencias. */
function Builder({
  q,
  draft,
  setDraft,
  suggest,
  showErrors,
  errors,
  addLine,
  removeLine,
  setAmount,
}: {
  q: ReturnType<typeof useQuoteStrings>;
  draft: Draft;
  setDraft: (d: Draft) => void;
  suggest: Suggestions;
  showErrors: boolean;
  errors: ReturnType<typeof validateLines> | null;
  addLine: (sec: keyof QuoteLines, label?: string) => void;
  removeLine: (sec: keyof QuoteLines, i: number) => void;
  setAmount: (sec: keyof QuoteLines, i: number, text: string) => void;
}) {
  const { colors, status } = useTheme();
  const subtotal = computeTotals(draft.lines, 0).subtotal;
  const section = (sec: keyof QuoteLines, title: string, addLabel: string) => {
    const used = new Set(draft.lines[sec].map((l) => l.label.trim().toLowerCase()));
    const chips = suggest[sec].filter((l) => !used.has(l.toLowerCase())).slice(0, 6);
    return (
      <View key={sec} style={{ marginBottom: 6 }}>
        <AppText size={sample.labelSize} color={colors.secondary} style={styles.sectionLabel}>
          {title}
        </AppText>
        {draft.lines[sec].map((line, i) => {
          const key = `${sec}.${i}`;
          const bad = showErrors && errors?.lines.has(key);
          const label = line.label.trim() || title;
          return (
            <View key={key} style={[styles.lineCard, { borderBottomColor: colors.border }]}>
              <View style={styles.twoCols}>
                <View style={{ flex: 1 }}>
                  <AppField
                    label={q.lineName}
                    value={line.label}
                    onChangeText={(v) => {
                      const lines = { ...draft.lines, [sec]: draft.lines[sec].map((l, j) => (j === i ? { ...l, label: v } : l)) } as QuoteLines;
                      setDraft({ ...draft, lines });
                    }}
                    autoCapitalize="sentences"
                  />
                </View>
                <View style={{ width: 120 }}>
                  <AppField
                    label={sec === 'discounts' && 'kind' in line && line.kind === 'percent' ? q.percent : q.amount}
                    value={draft.amounts[key] ?? ''}
                    onChangeText={(v) => setAmount(sec, i, v)}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.lineFoot}>
                {sec === 'discounts' && 'kind' in line ? (
                  <View style={{ width: 200 }}>
                    <Segmented
                      options={[
                        { value: 'amount', label: q.discountAmount },
                        { value: 'percent', label: '%' },
                      ]}
                      value={line.kind}
                      onChange={(kind) => {
                        const lines = { ...draft.lines, discounts: draft.lines.discounts.map((d, j) => (j === i ? { ...d, kind } : d)) };
                        setDraft({ ...draft, lines });
                      }}
                    />
                  </View>
                ) : (
                  <View style={styles.inline}>
                    <AppText size={sample.noteSize}>{q.taxable}</AppText>
                    <Switch
                      value={'taxable' in line ? line.taxable : false}
                      accessibilityLabel={`${q.taxable} · ${label}`}
                      onChange={(v) => {
                        const lines = { ...draft.lines, [sec]: draft.lines[sec].map((l, j) => (j === i ? { ...l, taxable: v } : l)) } as QuoteLines;
                        setDraft({ ...draft, lines });
                      }}
                    />
                  </View>
                )}
                {sec === 'discounts' && 'kind' in line && line.value !== null ? (
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    −{money(discountAmount(line, subtotal))}
                  </AppText>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={q.removeLine(label)} hitSlop={8} onPress={() => removeLine(sec, i)}>
                  <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
              </View>
              {bad ? (
                <AppText size={sample.noteSize} color={status.error}>
                  {sec === 'discounts' && 'kind' in line && line.kind === 'percent' && (line.value ?? 0) > 100 ? q.percentError : q.lineError}
                </AppText>
              ) : null}
            </View>
          );
        })}
        {chips.length > 0 ? (
          <View>
            <AppText size={sample.labelSize} color={colors.secondary} style={{ marginTop: 6, marginBottom: 4 }}>
              {q.suggestions}
            </AppText>
            <View style={styles.chips}>
              {chips.map((c) => (
                <Pressable key={c} accessibilityRole="button" onPress={() => addLine(sec, c)} style={[styles.suggest, { borderColor: colors.border }]}>
                  <AppText size={12}>{c}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ marginTop: 6 }}>
          <AppButton label={addLabel} variant="outline" icon="plus" onPress={() => addLine(sec)} />
        </View>
        {sec === 'services' && showErrors && errors?.noService ? <AppAlert tone="error" text={q.needService} /> : null}
      </View>
    );
  };
  return (
    <View>
      {section('services', q.services, q.addService)}
      {section('addons', q.addons, q.addAddon)}
      {section('discounts', q.discounts, q.addDiscount)}
    </View>
  );
}

/** Versión enviada (o borrador sin permiso de editar): fechas, renglones, decisión del cliente y archivos. */
function SentVersion({
  q,
  v,
  locale,
  onFile,
}: {
  q: ReturnType<typeof useQuoteStrings>;
  v: QuoteVersion;
  locale: 'es' | 'en';
  onFile: (path: string, title: string) => void;
}) {
  const { colors } = useTheme();
  const info: string[] = [];
  if (v.sentAt) info.push(v.sentBy ? `${q.sentOn(dateTime(v.sentAt, locale))} ${q.sentBy(v.sentBy)}` : q.sentOn(dateTime(v.sentAt, locale)));
  if (v.expiresAt) info.push(v.status === 'expired' ? q.expiredOn(shortDate(v.expiresAt, locale)) : q.expiresOn(shortDate(v.expiresAt, locale)));
  if (v.viewedAt) info.push(q.viewedOn(dateTime(v.viewedAt, locale)));
  const d = v.decision;
  const rows: { label: string; value: string }[] = [
    ...v.lines.services.map((l) => ({ label: l.label, value: l.amount === null ? '' : money(l.amount) })),
    ...v.lines.addons.map((l) => ({ label: l.label, value: l.amount === null ? '' : money(l.amount) })),
    ...v.lines.discounts.map((l) => ({ label: l.kind === 'percent' && l.value !== null ? `${l.label} (${l.value}%)` : l.label, value: '' })),
  ];
  return (
    <View>
      {info.map((t) => (
        <AppText key={t} size={sample.noteSize} color={colors.secondary}>
          {t}
        </AppText>
      ))}
      <View style={{ height: 8 }} />
      {rows.map((r, i) => (
        <View key={i} style={[styles.ln, { borderBottomColor: colors.border, borderBottomWidth: 0.5 }]}>
          <AppText size={14} style={{ flex: 1 }}>
            {r.label}
          </AppText>
          <AppText size={14} weight="medium">
            {r.value}
          </AppText>
        </View>
      ))}
      {v.totals ? <Totals q={q} totals={v.totals} taxRate={String(v.taxRate)} /> : (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 6 }}>
          {q.noPrices}
        </AppText>
      )}
      {v.contactEmail || v.recipients.length > 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 6 }}>
          {[v.contactEmail, ...v.recipients].filter(Boolean).join(', ')}
        </AppText>
      ) : null}
      {d ? (
        <View style={[styles.card, { borderColor: colors.fieldBorder }]}>
          <AppText size={sample.labelSize} color={colors.secondary}>
            {q.decision}
          </AppText>
          <AppText weight="medium">
            {d.kind === 'accepted' && d.name && d.title ? q.acceptedBy(d.name, d.title) : q.status[d.kind]}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary}>
            {dateTime(d.at, locale)} · {d.email}
          </AppText>
          {d.reasonEs || d.reasonEn ? (
            <AppText size={sample.noteSize}>{q.rejectedReason((locale === 'es' ? d.reasonEs : d.reasonEn) ?? '')}</AppText>
          ) : null}
          {d.note ? <AppText size={sample.noteSize}>{q.note(d.note)}</AppText> : null}
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {v.pdfPath ? <ListRow title={q.viewPdf} chevron onPress={() => onFile(v.pdfPath as string, q.version(v.version))} last={!v.sowPath} /> : null}
        {v.sowPath ? <ListRow title={q.readSow} chevron last onPress={() => onFile(v.sowPath as string, q.sow)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionLabel: { marginTop: 10, marginBottom: 2 },
  twoCols: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineCard: { borderBottomWidth: 0.5, paddingBottom: 8, marginBottom: 6 },
  lineFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggest: { borderWidth: 1, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 10 },
  ln: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  bar: { flexDirection: 'row', gap: 8, borderTopWidth: 0.5, paddingTop: 10, paddingHorizontal: 12 },
  card: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
});
