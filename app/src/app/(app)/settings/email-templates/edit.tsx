import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { FormScroll } from '@/components/FormScroll';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { TopBar } from '@/components/TopBar';
import { useEmailTemplatesStrings } from '@/i18n/useEmailTemplatesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  insertAt,
  PLACEHOLDERS,
  validateTemplate,
  type Placeholder,
  type TemplateAudience,
  type TemplateForm,
  type TemplateFormErrors,
} from '@/lib/emailTemplates';
import { deleteTemplate, fetchTemplate, saveTemplate } from '@/lib/emailTemplatesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

type Sel = { start: number; end: number };

/**
 * Editar plantilla (D-323 (2)): Nombre, Para (Prospectos / Clientes), Asunto, Texto y botones que insertan {nombre},
 * {empresa}, {dirección} y {firma} donde está el cursor; aviso ámbar del pie legal; Guardar. D-200: interruptor
 * Activa y "Eliminar plantilla" al editar.
 */
export default function EmailTemplateFormScreen() {
  const params = useLocalSearchParams<{ id?: string; audience?: string; sort?: string }>();
  const id = params.id ?? null;
  const goBack = useGoBack();
  const { colors, status, brand } = useTheme();
  const strings = useStrings();
  const t = useEmailTemplatesStrings();
  const { isSuperAdmin } = usePermissions();
  const [form, setForm] = useState<TemplateForm>({
    name: '',
    audience: params.audience === 'client' ? 'client' : 'prospect',
    subject: '',
    body: '',
    active: true,
  });
  const [loaded, setLoaded] = useState(!id);
  const [errors, setErrors] = useState<TemplateFormErrors>({});
  const [failure, setFailure] = useState<'load' | 'save' | 'delete' | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Dónde insertar: el último campo con foco (Asunto o Texto) y su cursor.
  const [target, setTarget] = useState<'subject' | 'body'>('body');
  const [sel, setSel] = useState<{ subject: Sel | null; body: Sel | null }>({ subject: null, body: null });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchTemplate(id).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setFailure('load');
        return;
      }
      setForm({ name: r.data.name, audience: r.data.audience, subject: r.data.subject, body: r.data.body, active: r.data.active });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isSuperAdmin) return <Redirect href="/" />;

  function insert(p: Placeholder) {
    const r = insertAt(form[target], sel[target], p);
    setForm({ ...form, [target]: r.text });
    setSel({ ...sel, [target]: { start: r.cursor, end: r.cursor } });
  }

  async function save() {
    if (saving || !loaded) return;
    const found = validateTemplate(form);
    setErrors(found);
    setFailure(null);
    if (found.name || found.subject || found.body) return;
    setSaving(true);
    const r = await saveTemplate(id, form, Number(params.sort ?? '0') || 0);
    setSaving(false);
    if (!r.ok) {
      setFailure('save');
      return;
    }
    goBack();
  }

  async function remove() {
    if (!id || saving) return;
    setSaving(true);
    const r = await deleteTemplate(id);
    setSaving(false);
    setConfirm(false);
    if (!r.ok) {
      setFailure('delete');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={id ? t.editTitle : t.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {failure === 'load' ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        <AppField label={t.name} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={errors.name ? t.errorName : null} />
        <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
          {t.audience}
        </AppText>
        <Segmented<TemplateAudience>
          options={[
            { value: 'prospect', label: t.tabProspects },
            { value: 'client', label: t.tabClients },
          ]}
          value={form.audience}
          onChange={(v) => setForm({ ...form, audience: v })}
        />
        <AppField
          label={t.subject}
          value={form.subject}
          onChangeText={(v) => setForm({ ...form, subject: v })}
          onFocus={() => setTarget('subject')}
          onSelectionChange={(e) => setSel({ ...sel, subject: e.nativeEvent.selection })}
          error={errors.subject ? t.errorSubject : null}
        />
        <AppField
          label={t.body}
          value={form.body}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 200 }}
          onChangeText={(v) => setForm({ ...form, body: v })}
          onFocus={() => setTarget('body')}
          onSelectionChange={(e) => setSel({ ...sel, body: e.nativeEvent.selection })}
          error={errors.body ? t.errorBody : null}
        />
        <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
          {t.insert}
        </AppText>
        <View style={styles.chips}>
          {PLACEHOLDERS.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={t.insertLabel(p)}
              onPress={() => insert(p)}
              style={[styles.chip, { borderColor: brand }]}
            >
              <AppText size={13} weight="medium" color={brand}>
                {`{${p}}`}
              </AppText>
            </Pressable>
          ))}
        </View>
        <AppAlert text={t.footerNote} />
        <View style={styles.switchRow}>
          <AppText style={{ flex: 1 }}>{t.activeSwitch}</AppText>
          <Switch value={form.active} onChange={(v) => setForm({ ...form, active: v })} accessibilityLabel={t.activeSwitch} />
        </View>
        {failure === 'save' ? <AppAlert tone="error" text={t.errorSave} /> : null}
        {failure === 'delete' ? <AppAlert tone="error" text={t.errorDelete} /> : null}
        <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving || !loaded} />
        {id && loaded ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={styles.danger}>
            <AppText weight="medium" size={sample.buttonSize} color={status.error}>
              {t.delete}
            </AppText>
          </Pressable>
        ) : null}
      </FormScroll>
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {t.deleteTitle(form.name)}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setConfirm(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={t.deleteConfirm} onPress={() => void remove()} disabled={saving} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: radius.control, paddingVertical: 6, paddingHorizontal: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  danger: { minHeight: sample.buttonMinHeight, alignItems: 'center', justifyContent: 'center' },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
