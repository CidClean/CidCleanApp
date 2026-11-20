import * as Clipboard from 'expo-clipboard';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { Dialog } from '@/components/Dialog';
import { FormScroll } from '@/components/FormScroll';
import { Segmented } from '@/components/Segmented';
import { Switch } from '@/components/Switch';
import { TopBar } from '@/components/TopBar';
import { DialogButtons } from '@/components/work/SimpleParts';
import type { LeadSourcesStrings } from '@/i18n/leadSources';
import { useLeadSourcesStrings } from '@/i18n/useLeadSourcesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  defaultEntersAs,
  intakeUrl,
  sourceLine,
  validateNewSource,
  type EntersAs,
  type LeadSourceItem,
  type NewSourceForm,
  type SourceKind,
} from '@/lib/leadSources';
import { createLeadSource, fetchLeadSources, rotateLeadSourceKey, updateLeadSource } from '@/lib/leadSourcesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

const URL = intakeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);

/**
 * Mi cuenta → Lead sources (orden 163, D-350 (5)), solo Super Admin: cada fuente con su interruptor, "Enters as"
 * editable y el conteo; "+ Add source"; rehacer la clave (con confirmación) y "Copy" de la dirección y de la clave.
 * La clave completa solo se ve al crearla o rehacerla; después, solo sus últimos 4.
 */
export default function LeadSourcesScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useLeadSourcesStrings();
  const { isSuperAdmin } = usePermissions();
  const [items, setItems] = useState<LeadSourceItem[] | null>(null);
  const [failure, setFailure] = useState<'load' | 'save' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // La clave recién creada o rehecha (solo en memoria, mientras se está en la pantalla).
  const [shown, setShown] = useState<{ id: string; key: string } | null>(null);
  const [remaking, setRemaking] = useState<LeadSourceItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);

  const load = useCallback(async () => {
    const r = await fetchLeadSources();
    if (!r.ok) {
      setFailure('load');
      return;
    }
    setFailure(null);
    setItems(r.data);
    setSelected((cur) => cur ?? r.data[0]?.id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) void load();
    }, [isSuperAdmin, load]),
  );

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function patch(item: LeadSourceItem, p: { active?: boolean; entersAs?: EntersAs }) {
    setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, ...p } : x)) ?? null);
    const r = await updateLeadSource(item.id, p);
    if (!r.ok) {
      setFailure('save');
      await load();
    }
  }

  async function remake() {
    if (!remaking) return;
    const r = await rotateLeadSourceKey(remaking.id);
    if (!r.ok) setFailure('save');
    else setShown({ id: remaking.id, key: r.data });
    setSelected(remaking.id);
    setRemaking(null);
    await load();
  }

  async function copy(what: 'url' | 'key', text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(what);
  }

  const current = items?.find((x) => x.id === selected) ?? null;
  const currentKey = current && shown?.id === current.id ? shown.key : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.title} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
        {failure ? <AppAlert tone="error" text={failure === 'load' ? t.errorLoad : t.errorSave} /> : null}
        {items === null && failure !== 'load' ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {items && items.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {t.empty}
          </AppText>
        ) : null}
        {items?.map((item) => (
          <SourceCard
            key={item.id}
            item={item}
            t={t}
            selected={item.id === selected}
            onSelect={() => {
              setSelected(item.id);
              setCopied(null);
            }}
            onToggle={(v) => void patch(item, { active: v })}
            onEntersAs={(v) => void patch(item, { entersAs: v })}
          />
        ))}
        {items ? <AppButton label={t.add} variant="outline" onPress={() => setAdding(true)} /> : null}

        {current ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <AppText weight="heavy" size={15}>
              {t.connection(current.name)}
            </AppText>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.connectionNote}
            </AppText>
            <CopyRow label={t.address} value={URL} copyLabel={copied === 'url' ? t.copied : t.copy} onCopy={() => void copy('url', URL)} />
            {currentKey ? (
              <>
                <CopyRow label={t.key} value={currentKey} copyLabel={copied === 'key' ? t.copied : t.copy} onCopy={() => void copy('key', currentKey)} />
                <AppAlert text={t.keyOnce} />
              </>
            ) : current.keyLast4 ? (
              <CopyRow label={t.key} value={t.keyHidden(current.keyLast4)} />
            ) : (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noKey}
              </AppText>
            )}
            <AppButton label={t.remakeKey} variant="outline" onPress={() => setRemaking(current)} />
          </View>
        ) : null}
      </FormScroll>

      <Dialog visible={remaking !== null} onClose={() => setRemaking(null)}>
        <AppText weight="heavy" size={17} style={{ marginBottom: 6 }}>
          {remaking ? t.remakeTitle(remaking.name) : ''}
        </AppText>
        <AppText size={14} color={colors.secondary} style={{ marginBottom: 14 }}>
          {t.remakeBody}
        </AppText>
        <DialogButtons cancel={t.cancel} save={t.remakeYes} onCancel={() => setRemaking(null)} onSave={() => void remake()} />
      </Dialog>

      <AddSourceDialog
        visible={adding}
        t={t}
        onClose={() => setAdding(false)}
        onCreated={(id, key) => {
          setAdding(false);
          setShown({ id, key });
          setSelected(id);
          setCopied(null);
          void load();
        }}
      />
    </View>
  );
}

function SourceCard({
  item,
  t,
  selected,
  onSelect,
  onToggle,
  onEntersAs,
}: {
  item: LeadSourceItem;
  t: LeadSourcesStrings;
  selected: boolean;
  onSelect: () => void;
  onToggle: (v: boolean) => void;
  onEntersAs: (v: EntersAs) => void;
}) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, selected ? { borderWidth: 1, borderColor: brand } : null]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={onSelect} style={{ flex: 1 }}>
          <AppText weight="heavy" size={15} color={item.active ? colors.text : colors.secondary}>
            {item.name}
          </AppText>
          <AppText size={12} color={colors.secondary}>
            {sourceLine(item, t)}
          </AppText>
        </Pressable>
        <Switch value={item.active} onChange={onToggle} accessibilityLabel={t.active(item.name)} />
      </View>
      <AppText size={12} weight="medium" color={colors.secondary}>
        {t.entersAs}
      </AppText>
      <Segmented
        options={[
          { value: 'potential', label: t.potential },
          { value: 'cold', label: t.cold },
        ]}
        value={item.entersAs}
        onChange={onEntersAs}
      />
    </View>
  );
}

function CopyRow({ label, value, copyLabel, onCopy }: { label: string; value: string; copyLabel?: string; onCopy?: () => void }) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.copy, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1 }}>
        <AppText size={11} color={colors.secondary}>
          {label}
        </AppText>
        <AppText size={13} selectable numberOfLines={2}>
          {value}
        </AppText>
      </View>
      {onCopy && copyLabel ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${copyLabel} ${label}`} onPress={onCopy} hitSlop={6} style={[styles.copyBtn, { borderColor: brand }]}>
          <AppText size={12} weight="heavy" color={colors.brandText}>
            {copyLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function AddSourceDialog({
  visible,
  t,
  onClose,
  onCreated,
}: {
  visible: boolean;
  t: LeadSourcesStrings;
  onClose: () => void;
  onCreated: (id: string, key: string) => void;
}) {
  const [form, setForm] = useState<NewSourceForm>({ name: '', kind: 'agent', entersAs: 'cold' });
  const [error, setError] = useState<'name' | 'duplicate' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (validateNewSource(form).name) {
      setError('name');
      return;
    }
    setBusy(true);
    const r = await createLeadSource(form.name, form.kind, form.entersAs);
    setBusy(false);
    if (!r.ok) {
      setError(r.reason === 'duplicate' ? 'duplicate' : 'save');
      return;
    }
    setForm({ name: '', kind: 'agent', entersAs: 'cold' });
    setError(null);
    onCreated(r.data.id, r.data.key);
  }

  return (
    <Dialog visible={visible} onClose={onClose}>
      <AppText weight="heavy" size={17} style={{ marginBottom: 8 }}>
        {t.newTitle}
      </AppText>
      <AppField
        label={t.name}
        value={form.name}
        onChangeText={(v) => setForm({ ...form, name: v })}
        error={error === 'name' ? t.errorName : error === 'duplicate' ? t.errorDuplicate : null}
      />
      <AppText size={12} weight="medium" style={{ marginBottom: 6 }}>
        {t.kind}
      </AppText>
      <Segmented
        options={(['ads', 'agent', 'other'] as const).map((k) => ({ value: k, label: t.kinds[k] }))}
        value={form.kind}
        onChange={(k: SourceKind) => setForm({ ...form, kind: k, entersAs: defaultEntersAs(k) })}
      />
      <AppText size={12} weight="medium" style={{ marginBottom: 6 }}>
        {t.entersAs}
      </AppText>
      <Segmented
        options={[
          { value: 'potential', label: t.potential },
          { value: 'cold', label: t.cold },
        ]}
        value={form.entersAs}
        onChange={(v) => setForm({ ...form, entersAs: v })}
      />
      {error === 'save' ? <AppAlert tone="error" text={t.errorSave} /> : null}
      <DialogButtons cancel={t.cancel} save={t.create} onCancel={onClose} onSave={() => void submit()} disabled={busy} />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  copyBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },
});
