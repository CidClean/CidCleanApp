import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { CardBlock } from '@/components/bento/Card';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { Chip } from '@/components/Chip';
import { FormScroll } from '@/components/FormScroll';
import { TopBar } from '@/components/TopBar';
import { useEmailTemplatesStrings } from '@/i18n/useEmailTemplatesStrings';
import { useStrings } from '@/i18n/useStrings';
import { canSeeAccounts } from '@/lib/clientRules';
import {
  audienceFor,
  buildEmail,
  buildMailto,
  copyText,
  initialValues,
  missingFields,
  sortTemplates,
  usedPlaceholders,
  validEmail,
  type EmailTemplate,
  type FillValues,
  type TemplateContext,
  type TemplateEntity,
} from '@/lib/emailTemplates';
import { fetchTemplateContext, fetchTemplates, logTemplateEmail } from '@/lib/emailTemplatesApi';
import { canSeeLeads } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Enviar correo desde un lead o un cliente (D-321, D-323 (1); surveys/plantillas-correo-aprobado.html):
 * lista de plantillas de su tipo (radio) → "Continuar" → vista previa con Para, Asunto, texto llenado y el pie legal →
 * "Abrir en mi correo" (`mailto:`) o "Copiar texto". Lo que falta se marca y se escribe antes. Cada apertura o copia
 * queda en el historial (log_template_email). La app no manda el correo: lo manda quien envía desde su correo.
 */
export default function SendEmailScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind: TemplateEntity = params.kind === 'client' ? 'client' : 'lead';
  const id = params.id;
  const goBack = useGoBack();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const t = useEmailTemplatesStrings();
  const { access } = usePermissions();
  const audience = audienceFor(kind);

  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [ctx, setCtx] = useState<TemplateContext | null>(null);
  const [failed, setFailed] = useState<'load' | 'context' | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'preview'>('pick');
  const [contactIndex, setContactIndex] = useState(0);
  const [to, setTo] = useState('');
  const [values, setValues] = useState<FillValues | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<'tooLong' | 'openFailed' | 'copied' | 'copyFailed' | 'log' | null>(null);
  // D-200: los campos que faltaban al abrir la vista previa quedan fijos mientras se escribe (antes desaparecían con la primera letra).
  const [asked, setAsked] = useState<(keyof FillValues)[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchTemplates(audience, true), fetchTemplateContext(kind, id)]).then(([a, b]) => {
      if (cancelled) return;
      if (!a.ok) setFailed('load');
      else {
        const list = sortTemplates(a.data);
        setTemplates(list);
        setChosen(list[0]?.id ?? null);
      }
      if (!b.ok) setFailed((f) => f ?? 'context');
      else {
        setCtx(b.data);
        pickContact(b.data, 0);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, kind, id]);

  const template = templates?.find((x) => x.id === chosen) ?? null;
  const used = useMemo(() => (template ? usedPlaceholders(template.subject, template.body) : []), [template]);
  const email = values && template ? buildEmail(template, values) : null;
  const emailOk = validEmail(to);

  if (kind === 'lead' ? !canSeeLeads(access) : !canSeeAccounts(access)) return <Redirect href="/" />;

  function pickContact(c: TemplateContext, i: number) {
    const contact = c.contacts[i] ?? null;
    setContactIndex(i);
    setTo(contact?.email ?? '');
    const v = initialValues(c, contact);
    setValues(v);
    setAsked(missingFields(used, v));
  }

  function ready(): boolean {
    setShowErrors(true);
    setNotice(null);
    return emailOk;
  }

  async function log(via: 'open' | 'copy') {
    if (!template) return;
    const r = await logTemplateEmail(template.id, kind, id, via);
    if (!r.ok) setNotice('log');
  }

  async function open() {
    if (!email || !ready()) return;
    // D-329: el correo se abre SIEMPRE solo con destinatario y asunto; el texto completo va al portapapeles para pegarlo.
    const url = buildMailto(to, email.subject, '');
    let copied = false;
    try {
      const text = copyText(email.subject, email.body);
      if (Platform.OS === 'web') await navigator.clipboard.writeText(text);
      else await Clipboard.setStringAsync(text);
      copied = true;
    } catch {
      copied = false;
    }
    setNotice(copied ? 'copied' : 'copyFailed');
    if (Platform.OS === 'web') {
      window.location.href = url;
    } else {
      try {
        await Linking.openURL(url);
      } catch {
        setNotice('openFailed');
        return;
      }
    }
    await log('open');
  }

  async function copy() {
    if (!email || !ready()) return;
    const text = copyText(email.subject, email.body);
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
        setNotice('copied');
      } else {
        await Clipboard.setStringAsync(text);
        setNotice('copied');
      }
    } catch {
      return;
    }
    await log('copy');
  }

  const header = [ctx?.company, ctx?.contacts[contactIndex]?.name].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={step === 'pick' ? t.send : t.preview}
        onBack={step === 'preview' ? () => setStep('pick') : goBack}
        backLabel={strings.common.back}
        subtitle={
          header ? (
            <AppText size={sample.noteSize} color={colors.secondary}>
              {header}
            </AppText>
          ) : undefined
        }
      />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {failed === 'load' ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {failed === 'context' ? <AppAlert tone="error" text={t.errorContext} /> : null}
        {!failed && (!templates || !ctx) ? <BrandLoading label={strings.common.loading} /> : null}

        {step === 'pick' && templates ? (
          <>
            <View style={styles.listHead}>
              <AppText size={sample.labelSize} color={colors.secondary}>
                {audience === 'prospect' ? t.listProspects : t.listClients}
              </AppText>
              <Chip label={audience === 'prospect' ? t.chipProspect : t.chipClient} tone="brand" />
            </View>
            {templates.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noTemplates}
              </AppText>
            ) : (
              <CardBlock>
                {templates.map((x, i) => {
                  const on = x.id === chosen;
                  return (
                    <Pressable
                      key={x.id}
                      accessibilityRole="radio"
                      accessibilityLabel={x.name}
                      accessibilityState={{ checked: on }}
                      onPress={() => setChosen(x.id)}
                      style={[styles.radioRow, { borderBottomColor: colors.border, borderBottomWidth: i === templates.length - 1 ? 0 : 0.5 }]}
                    >
                      <View style={[styles.radio, { borderColor: on ? brand : colors.fieldBorder }]}>
                        {on ? <View style={[styles.radioDot, { backgroundColor: brand }]} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText weight="medium">{x.name}</AppText>
                        <AppText size={sample.noteSize} color={colors.secondary}>
                          {x.subject}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </CardBlock>
            )}
            <View style={{ height: 12 }} />
            <AppButton label={t.continue} onPress={() => {
                if (values) setAsked(missingFields(used, values));
                setStep('preview');
              }}
              disabled={!template || !ctx}
            />
          </>
        ) : null}

        {step === 'preview' && template && ctx && values && email ? (
          <>
            {ctx.contacts.filter((c) => c.email).length > 1 ? (
              <>
                <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
                  {t.contact}
                </AppText>
                <CardBlock>
                  {ctx.contacts.map((c, i) =>
                    c.email ? (
                      <Pressable
                        key={`${c.email}-${i}`}
                        accessibilityRole="radio"
                        accessibilityLabel={c.name ? `${c.name} ${c.email}` : c.email}
                        accessibilityState={{ checked: i === contactIndex }}
                        onPress={() => pickContact(ctx, i)}
                        style={[styles.radioRow, { borderBottomColor: colors.border, borderBottomWidth: 0.5 }]}
                      >
                        <View style={[styles.radio, { borderColor: i === contactIndex ? brand : colors.fieldBorder }]}>
                          {i === contactIndex ? <View style={[styles.radioDot, { backgroundColor: brand }]} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText weight="medium">{c.name ?? c.email}</AppText>
                          {c.name ? (
                            <AppText size={sample.noteSize} color={colors.secondary}>
                              {c.email}
                            </AppText>
                          ) : null}
                        </View>
                      </Pressable>
                    ) : null,
                  )}
                </CardBlock>
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <AppField
              label={t.to}
              value={to}
              onChangeText={setTo}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={showErrors && !emailOk ? (to.trim() ? t.badEmail : t.missingEmail) : null}
            />
            {asked.length > 0 ? (
              <>
                <AppAlert text={t.missingTitle} />
                {asked.map((k) => (
                  <AppField
                    key={k}
                    label={t.missing[k]}
                    value={values[k]}
                    onChangeText={(v) => setValues({ ...values, [k]: v })}
                    keyboardType={k === 'telefono' ? 'phone-pad' : 'default'}
                  />
                ))}
              </>
            ) : null}
            <CardBlock style={{ paddingVertical: 14, gap: 10 }}>
              <AppText selectable>
                <AppText weight="medium">{`${t.subject}: `}</AppText>
                {email.subject}
              </AppText>
              <AppText selectable testID="email-body">
                {email.body}
              </AppText>
            </CardBlock>
            {notice === 'tooLong' ? <AppAlert text={t.tooLong} /> : null}
            {notice === 'openFailed' ? <AppAlert text={t.openFailed} /> : null}
            {notice === 'copyFailed' ? <AppAlert tone="error" text={t.copyFailed} /> : null}
            {notice === 'log' ? <AppAlert tone="error" text={t.errorLog} /> : null}
            {notice === 'copied' ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {t.copied}
              </AppText>
            ) : null}
            <View style={{ gap: 8 }}>
              <AppButton label={t.open} icon="mail" onPress={() => void open()} />
              <AppButton label={t.copy} variant="outline" onPress={() => void copy()} />
            </View>
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
