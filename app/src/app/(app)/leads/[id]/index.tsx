import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { LeadFormFields } from '@/components/sales/LeadFormFields';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { Tabs } from '@/components/Tabs';
import { TopBar } from '@/components/TopBar';
import type { SalesStrings } from '@/i18n/sales';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  LEAD_STATUSES,
  canDeleteLeads,
  canEditLeads,
  canSeeLeads,
  dateFromKey,
  formatDateTime,
  formatShortDate,
  hasLeadErrors,
  leadFormFrom,
  reasonLabel,
  siteLabel,
  statusChangeAction,
  statusTone,
  validateLeadForm,
  type Lead,
  type LeadForm,
  type LeadFormErrors,
  type LeadSite,
  type LeadStatus,
} from '@/lib/leadRules';
import { deleteLead, deleteSite, fetchLead, setLeadStatus, updateLead } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

type Tab = 'data' | 'sites' | 'notes';

/**
 * Detalle del lead (D-070): encabezado con empresa, "Lead · Fuente" y ficha de estado; pestañas Datos, Sitios y Notas.
 * Datos lleva el campo Estado (D-071); elegir Perdido abre "Marcar como perdido" (D-079).
 * "Editar" en la barra vuelve formulario la pestaña Datos o Notas (como D-174).
 */
export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors, status } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { locale } = useSession();
  const { access } = usePermissions();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('data');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LeadForm | null>(null);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  // D-201 y D-202: hojas de confirmación para eliminar el lead o un sitio.
  const [confirm, setConfirm] = useState<{ kind: 'lead' } | { kind: 'site'; site: LeadSite } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<'lead' | 'site' | 'siteDone' | null>(null);

  const load = useCallback(async () => {
    const result = await fetchLead(id);
    if (result.ok) {
      setLead(result.data);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!canSeeLeads(access)) return <Redirect href="/" />;
  const canEdit = canEditLeads(access);

  function startEditing() {
    if (!lead) return;
    setForm(leadFormFrom(lead));
    setErrors({});
    setSaveError(false);
    setEditing(true);
  }

  function changeTab(next: Tab) {
    setEditing(false);
    setTab(next);
  }

  async function save() {
    if (!lead || !form || saving) return;
    const found = validateLeadForm(form);
    setErrors(found);
    if (hasLeadErrors(found)) return;
    setSaving(true);
    setSaveError(false);
    const result = await updateLead(lead, form);
    setSaving(false);
    if (!result.ok) {
      setSaveError(true);
      return;
    }
    await load();
    setEditing(false);
  }

  async function changeStatus(next: LeadStatus) {
    if (!lead) return;
    const action = statusChangeAction(lead.status, next);
    setStatusError(false);
    if (action === 'askLostReason') {
      router.push({ pathname: '/leads/[id]/lost', params: { id: lead.id } });
      return;
    }
    if (action === 'none' || next === 'lost') return;
    const result = await setLeadStatus(lead.id, next);
    if (!result.ok) {
      setStatusError(true);
      return;
    }
    await load();
  }

  async function confirmDelete() {
    if (!lead || !confirm || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    if (confirm.kind === 'lead') {
      const result = await deleteLead(lead.id);
      setDeleting(false);
      setConfirm(null);
      if (!result.ok) {
        setDeleteError('lead');
        return;
      }
      // D-201: al eliminar vuelve al Pipeline.
      router.navigate('/pipeline');
      return;
    }
    const result = await deleteSite(confirm.site.id);
    setDeleting(false);
    setConfirm(null);
    if (!result.ok) {
      setDeleteError(result.reason === 'invalid' ? 'siteDone' : 'site');
      return;
    }
    await load();
  }

  const topAction =
    lead && canEdit && tab !== 'sites'
      ? editing
        ? { label: strings.common.cancel, onPress: () => setEditing(false), accessibilityLabel: strings.common.cancel }
        : { label: strings.common.edit, onPress: startEditing, accessibilityLabel: strings.common.edit }
      : undefined;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title={s.detail.barTitle} onBack={goBack} backLabel={strings.common.back} action={topAction} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed && !lead ? <AppAlert tone="error" text={s.detail.errorLoad} /> : null}
        {lead ? (
          <>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <AppText weight="medium" size={sample.headingSize}>
                  {lead.company}
                </AppText>
                <AppText size={sample.noteSize} color={colors.secondary}>
                  {s.detail.sourceLine(s.source[lead.source])}
                </AppText>
              </View>
              <Chip label={s.status[lead.status]} tone={statusTone(lead.status)} />
            </View>

            <Tabs
              value={tab}
              onChange={changeTab}
              tabs={[
                { key: 'data', label: s.detail.tabData },
                { key: 'sites', label: s.detail.tabSites },
                { key: 'notes', label: s.detail.tabNotes },
              ]}
            />

            {tab === 'data' && !editing ? (
              <>
                <DataSection lead={lead} s={s} locale={locale} />
                {canEdit ? (
                  <View style={{ marginTop: 12 }}>
                    {statusError ? <AppAlert tone="error" text={s.detail.errorStatus} /> : null}
                    <SelectField
                      label={s.detail.status}
                      options={LEAD_STATUSES.map((v) => ({ value: v, label: s.status[v] }))}
                      value={lead.status}
                      onChange={(v) => void changeStatus(v)}
                    />
                  </View>
                ) : null}
                {canDeleteLeads(access) ? (
                  <View style={{ marginTop: 12 }}>
                    {deleteError === 'lead' ? <AppAlert tone="error" text={s.detail.errorDelete} /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setConfirm({ kind: 'lead' })}
                      style={styles.dangerText}
                    >
                      <AppText weight="medium" size={sample.buttonSize} color={status.error}>
                        {s.detail.deleteLead}
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}

            {tab === 'sites' && (deleteError === 'site' || deleteError === 'siteDone') ? (
              <AppAlert tone="error" text={deleteError === 'siteDone' ? s.sites.errorDone : s.sites.errorDelete} />
            ) : null}
            {tab === 'sites' ? (
              <SitesSection
                lead={lead}
                s={s}
                canEdit={canEdit}
                onAdd={() => router.push({ pathname: '/leads/[id]/new-site', params: { id: lead.id } })}
                onEdit={(siteId) => router.push({ pathname: '/leads/[id]/new-site', params: { id: lead.id, site: siteId } })}
                onDelete={(site) => {
                  setDeleteError(null);
                  setConfirm({ kind: 'site', site });
                }}
                onSchedule={(siteId) =>
                  router.push({
                    pathname: '/leads/[id]/schedule',
                    params: siteId ? { id: lead.id, site: siteId } : { id: lead.id },
                  })
                }
              />
            ) : null}

            {tab === 'notes' && !editing ? (
              <AppText color={lead.notes ? colors.text : colors.secondary}>{lead.notes ?? s.detail.noNotes}</AppText>
            ) : null}

            {editing && form ? (
              <>
                <LeadFormFields form={form} errors={errors} onChange={setForm} s={s} part={tab === 'notes' ? 'notes' : 'data'} />
                {saveError ? <AppAlert tone="error" text={s.form.errorSave} /> : null}
                <View style={{ height: 4 }} />
                <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {confirm?.kind === 'lead'
            ? s.detail.deleteTitle(lead?.company ?? '')
            : confirm?.kind === 'site'
              ? s.sites.deleteTitle(siteLabel(confirm.site))
              : ''}
        </AppText>
        {confirm?.kind === 'lead' ? (
          <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
            {s.detail.deleteBody}
          </AppText>
        ) : null}
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setConfirm(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={s.detail.delete} onPress={() => void confirmDelete()} disabled={deleting} />
          </View>
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/** Filas de la pestaña Datos (muestra ronda 8 `.vr`: nombre del dato en medio peso y el valor gris debajo). */
function DataSection({ lead, s, locale }: { lead: Lead; s: SalesStrings; locale: 'es' | 'en' }) {
  const rows: { label: string; value: string }[] = [
    { label: s.detail.contact, value: lead.contactName ?? s.detail.none },
    { label: s.detail.phone, value: lead.phone ?? s.detail.none },
    { label: s.detail.email, value: lead.email ?? s.detail.none },
    {
      label: s.detail.followUp,
      value: lead.followUpOn ? formatShortDate(dateFromKey(lead.followUpOn), s) : s.detail.none,
    },
  ];
  if (lead.status === 'lost' && lead.lostReason) {
    rows.push({ label: s.detail.lostReason, value: reasonLabel(lead.lostReason, locale) });
    if (lead.lostNote) rows.push({ label: s.detail.lostNote, value: lead.lostNote });
  }
  return (
    <View>
      {rows.map((r, i) => (
        <ListRow key={r.label} title={r.label} detail={r.value} last={i === rows.length - 1} />
      ))}
    </View>
  );
}

/** Pestaña Sitios: un sitio por fila con su walkthrough; Agendar walkthrough y Agregar sitio con `leads_editar`. */
function SitesSection({
  lead,
  s,
  canEdit,
  onAdd,
  onSchedule,
  onEdit,
  onDelete,
}: {
  lead: Lead;
  s: SalesStrings;
  canEdit: boolean;
  onAdd: () => void;
  onSchedule: (siteId?: string) => void;
  onEdit: (siteId: string) => void;
  onDelete: (site: LeadSite) => void;
}) {
  const { colors } = useTheme();
  const hasSites = lead.sites.length > 0;
  return (
    <View>
      {!hasSites ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {canEdit ? s.sites.needSite : s.sites.empty}
        </AppText>
      ) : null}
      {lead.sites.map((site, i) => (
        <ListRow
          key={site.id}
          title={siteLabel(site)}
          detail={site.scheduled ? s.sites.walkthroughOn(formatDateTime(site.scheduled.startsAt, s)) : s.sites.noWalkthrough}
          right={
            canEdit ? (
              <View style={styles.rowIcons}>
                <Pressable accessibilityRole="button" accessibilityLabel={s.sites.editLabel(siteLabel(site))} onPress={() => onEdit(site.id)} hitSlop={8}>
                  <Icon name="pencil" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={s.sites.deleteLabel(siteLabel(site))} onPress={() => onDelete(site)} hitSlop={8}>
                  <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
              </View>
            ) : undefined
          }
          last={i === lead.sites.length - 1}
          onPress={canEdit ? () => onSchedule(site.id) : undefined}
        />
      ))}
      {canEdit ? (
        <View style={{ gap: 8, marginTop: hasSites ? 12 : 0 }}>
          {hasSites ? <AppButton label={s.sites.schedule} onPress={() => onSchedule()} /> : null}
          <AppButton label={s.sites.add} variant="outline" icon="plus" onPress={onAdd} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  // Lápiz y papelera de 18px con 14px entre ellos (muestra ronda 12, D-113).
  rowIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // Botón de texto rojo (D-201): mismo alto que los botones (40px), sin contorno.
  dangerText: { minHeight: sample.buttonMinHeight, alignItems: 'center', justifyContent: 'center' },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
