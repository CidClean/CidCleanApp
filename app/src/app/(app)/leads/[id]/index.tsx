import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { LeadFormFields } from '@/components/sales/LeadFormFields';
import { LeadStatusChip } from '@/components/sales/LeadStatusChip';
import { SelectField } from '@/components/SelectField';
import { Tabs } from '@/components/Tabs';
import { TopBar } from '@/components/TopBar';
import type { SalesStrings } from '@/i18n/sales';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  LEAD_STATUSES,
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
  type LeadStatus,
} from '@/lib/leadRules';
import { fetchLead, setLeadStatus, updateLead } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

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
  const { colors } = useTheme();
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
              <LeadStatusChip label={s.status[lead.status]} tone={statusTone(lead.status)} />
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
              </>
            ) : null}

            {tab === 'sites' ? (
              <SitesSection
                lead={lead}
                s={s}
                canEdit={canEdit}
                onAdd={() => router.push({ pathname: '/leads/[id]/new-site', params: { id: lead.id } })}
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
}: {
  lead: Lead;
  s: SalesStrings;
  canEdit: boolean;
  onAdd: () => void;
  onSchedule: (siteId?: string) => void;
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
          chevron={canEdit}
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
});
