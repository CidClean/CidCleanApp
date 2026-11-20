import { AddressReviewNote } from '@/components/AddressFields';
import { useAddressStrings } from '@/i18n/useAddressStrings';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CleaningTypeField } from '@/components/contract/CleaningTypeField';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { Bento, Card, CardBlock, useCardText, type CardTone } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { DocIcon, LeadCalendarIcon, NoteIcon, PinIcon } from '@/components/illustrations';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { LeadFormFields } from '@/components/sales/LeadFormFields';
import { SiteRequests } from '@/components/sales/SiteRequests';
import { SendEmailBlock } from '@/components/sales/SendEmailBlock';
import { LeadFlowButtons, LeadFlowDialog, useWriteToLead, type FlowAsk } from '@/components/sales/LeadFlow';
import { Icon } from '@/components/Icon';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { LeadQuotes } from '@/components/quotes/LeadQuotes';
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
  dayMonth,
  followupTimeline,
  hasLeadErrors,
  isColdStatus,
  leadFormFrom,
  reasonLabel,
  siteLabel,
  statusChangeAction,
  validateLeadForm,
  type Lead,
  type LeadForm,
  type LeadFormErrors,
  type LeadSite,
  type LeadStatus,
} from '@/lib/leadRules';
import { deleteLead, deleteSite, fetchLead, setLeadStatus, updateLead } from '@/lib/leadsApi';
import { canDoWalkthroughs } from '@/lib/walkthroughRules';
import { formatPhone, phoneDigits } from '@/lib/phone';
import { fetchLeadQuotes, type SiteQuoteRow } from '@/lib/quotesApi';
import type { QuoteStrings } from '@/i18n/quotes';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { canAny } from '@/lib/visibility';
import { LeadWalkthroughs } from '@/components/walkthrough/LeadWalkthroughs';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

// D-226 (reemplaza las pestañas de D-220): la vista general y las secciones que abre cada tarjeta del mosaico.
type Section = 'sites' | 'walkthrough' | 'quote' | 'notes';

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
  const w = useWalkthroughStrings();
  const q = useQuoteStrings();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const [quoteRows, setQuoteRows] = useState<SiteQuoteRow[] | null>(null);
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
  const [ask, setAsk] = useState<FlowAsk | null>(null);
  const write = useWriteToLead();

  const seesQuotes = canAny(access, ['quotes_ver', 'quotes_editar', 'quotes_enviar']);
  const load = useCallback(async () => {
    if (seesQuotes) void fetchLeadQuotes(id).then((r) => r.ok && setQuoteRows(r.data));
    const result = await fetchLead(id);
    if (result.ok) {
      setLead(result.data);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
  }, [id, seesQuotes]);

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

  function openSection(next: Section | null) {
    setEditing(false);
    setSection(next);
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
      // D-346: al eliminar vuelve a la pantalla anterior (Leads si no hay).
      if (router.canGoBack()) router.back();
      else router.navigate('/pipeline');
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

  const canWalk = canDoWalkthroughs(access);
  // Editar (D-174) en la vista general cambia los datos; en Notas, las notas.
  const editAction =
    lead && canEdit && (section === null || section === 'notes')
      ? editing
        ? { label: strings.common.cancel, onPress: () => setEditing(false) }
        : { label: strings.common.edit, onPress: startEditing }
      : undefined;
  const sectionTitle =
    section === 'sites' ? s.detail.tabSites : section === 'walkthrough' ? s.detail.tabWalkthrough : section === 'quote' ? s.detail.tabQuote : section === 'notes' ? s.detail.tabNotes : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader
        onBack={section ? () => openSection(null) : goBack}
        backLabel={strings.common.back}
        title={sectionTitle}
        action={editAction}
      />
      <FormScroll contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {loadFailed && !lead ? <AppAlert tone="error" text={s.detail.errorLoad} /> : null}
        {lead && section === null && !editing ? (
          <Bento>
            <LeadMainCard
              lead={lead}
              s={s}
              onMail={lead.email ? () => write(lead.id, lead.status) : undefined} // D-353
              onResponded={canEdit && isColdStatus(lead.status) ? () => setAsk({ kind: 'responded', id: lead.id, company: lead.company }) : undefined}
            />
            {isColdStatus(lead.status) || lead.firstContactAt ? (
              <FollowupCard lead={lead} s={s} canEdit={canEdit} onAsk={setAsk} />
            ) : null}
            <Card tone="attention" onPress={() => openSection('walkthrough')} accessibilityLabel={s.detail.tabWalkthrough} style={styles.tile}>
              <LeadCalendarIcon />
              <TileText title={s.detail.tabWalkthrough} line={walkthroughLine(lead, s, w)} tone="attention" />
            </Card>
            {seesQuotes ? (
              <Card onPress={() => openSection('quote')} accessibilityLabel={s.detail.tabQuote} style={styles.tile}>
                <DocIcon />
                <TileText title={s.detail.tabQuote} line={quoteLine(quoteRows, s, q)} tone="plain" />
              </Card>
            ) : null}
            <Card onPress={() => openSection('sites')} accessibilityLabel={s.detail.tabSites} style={styles.tile}>
              <PinIcon />
              <TileText title={s.detail.tabSites} line={s.detail.sitesCount(lead.sites.length)} tone="plain" />
            </Card>
            <Card tone="dark" onPress={() => openSection('notes')} accessibilityLabel={s.detail.tabNotes} style={styles.tile}>
              <NoteIcon />
              <TileText title={s.detail.tabNotes} line={lead.notes?.trim() || s.detail.noNotes} tone="dark" />
            </Card>
            <View style={{ width: '100%' }}>
              <DataSection lead={lead} s={s} locale={locale} />
              {/* Orden 120 (D-321, D-323): Enviar correo con plantilla de prospectos y su línea de tiempo. */}
              <SendEmailBlock kind="lead" id={lead.id} />
              {/* D-333 (3): "Cambiar estado" solo para corregir, en el menú del lead (ya no en un botón fijo). */}
              {canEdit ? (
                <View style={{ marginTop: 8 }}>
                  {statusError ? <AppAlert tone="error" text={s.detail.errorStatus} /> : null}
                  <SelectField
                    label={s.flow.changeStatus}
                    options={LEAD_STATUSES.map((v) => ({ value: v, label: s.status[v] }))}
                    value={lead.status}
                    onChange={(v) => void changeStatus(v)}
                    renderTrigger={(_label, open) => (
                      <Pressable accessibilityRole="button" onPress={open} style={styles.dangerText}>
                        <AppText weight="medium" size={sample.buttonSize} color={colors.text}>
                          {s.flow.changeStatus}
                        </AppText>
                      </Pressable>
                    )}
                  />
                </View>
              ) : null}
              {canDeleteLeads(access) ? (
                <View>
                  {deleteError === 'lead' ? <AppAlert tone="error" text={s.detail.errorDelete} /> : null}
                  <Pressable accessibilityRole="button" onPress={() => setConfirm({ kind: 'lead' })} style={styles.dangerText}>
                    <AppText weight="medium" size={sample.buttonSize} color={status.error}>
                      {s.detail.deleteLead}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </Bento>
        ) : null}

        {lead && section === 'sites' ? (
          <>
            {deleteError === 'site' || deleteError === 'siteDone' ? (
              <AppAlert tone="error" text={deleteError === 'siteDone' ? s.sites.errorDone : s.sites.errorDelete} />
            ) : null}
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
                router.push({ pathname: '/leads/[id]/schedule', params: siteId ? { id: lead.id, site: siteId } : { id: lead.id } })
              }
            />
          </>
        ) : null}

        {lead && section === 'walkthrough' ? (
          <WalkthroughSection
            lead={lead}
            s={s}
            canEdit={canEdit}
            canWalkthrough={canWalk}
            onWalkthrough={() => router.push({ pathname: '/walkthrough/new', params: { lead: lead.id } })}
            onSchedule={(siteId) =>
              router.push({ pathname: '/leads/[id]/schedule', params: siteId ? { id: lead.id, site: siteId } : { id: lead.id } })
            }
          />
        ) : null}

        {/* La lista de quotes de cada sitio (D-208). */}
        {/* D-289: tipo de limpieza del lead (Residencial no lleva el 6 %). */}
        {lead && section === 'quote' ? <CleaningTypeField kind="lead" id={lead.id} canEdit={canEdit} /> : null}
        {lead && section === 'quote' ? <LeadQuotes leadId={lead.id} sites={lead.sites} oneTime={lead.service === 'one_time'} /> : null}

        {lead && section === 'notes' && !editing ? (
          <>
            <CardBlock style={{ paddingVertical: 14 }}>
              <AppText color={lead.notes ? colors.text : colors.secondary}>{lead.notes ?? s.detail.noNotes}</AppText>
            </CardBlock>
            {/* Orden 101 (N2): envíos del sitio con el correo de este lead abierto, sin verificar. */}
            <SiteRequests leadId={lead.id} s={s} />
          </>
        ) : null}

        {editing && form ? (
          <>
            <LeadFormFields form={form} errors={errors} onChange={setForm} s={s} part={section === 'notes' ? 'notes' : 'data'} />
            {saveError ? <AppAlert tone="error" text={s.form.errorSave} /> : null}
            <View style={{ height: 4 }} />
            <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
          </>
        ) : null}
      </FormScroll>

      <LeadFlowDialog
        ask={ask}
        s={s}
        onClose={() => setAsk(null)}
        onDone={() => {
          setAsk(null);
          void load();
        }}
      />

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
    </View>
  );
}

/** Filas de la pestaña Datos (muestra ronda 8 `.vr`: nombre del dato en medio peso y el valor gris debajo). */
function DataSection({ lead, s, locale }: { lead: Lead; s: SalesStrings; locale: 'es' | 'en' }) {
  const rows: { label: string; value: string }[] = [
    { label: s.detail.contact, value: lead.contactName ?? s.detail.none },
    { label: s.detail.phone, value: lead.phone ? formatPhone(lead.phone) : s.detail.none },
    { label: s.detail.email, value: lead.email ?? s.detail.none },
    { label: s.form.language, value: lead.language === 'es' ? 'Español' : 'English' },
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
    <CardBlock>
      {rows.map((r, i) => (
        <ListRow key={r.label} title={r.label} detail={r.value} last={i === rows.length - 1} />
      ))}
    </CardBlock>
  );
}

/** Pestaña Sitios (D-220): un sitio por fila con lápiz y papelera, y Agregar sitio con `leads_editar`. */
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
  canWalkthrough?: boolean;
  onWalkthrough?: () => void;
  onAdd: () => void;
  onSchedule: (siteId?: string) => void;
  onEdit: (siteId: string) => void;
  onDelete: (site: LeadSite) => void;
}) {
  const { colors } = useTheme();
  const addressT = useAddressStrings();
  const hasSites = lead.sites.length > 0;
  return (
    <View>
      {!hasSites ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {canEdit ? s.sites.needSite : s.sites.empty}
        </AppText>
      ) : null}
      {hasSites ? (
      <CardBlock style={{ marginBottom: 0 }}>
      {lead.sites.map((site, i) => (
        <ListRow
          key={site.id}
          title={siteLabel(site)}
          detail={site.name?.trim() ? site.address : undefined}
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
      </CardBlock>
      ) : null}
      {/* D-301: dirección vieja sin separar. */}
      {lead.sites.filter((x) => x.addressNeedsReview).map((x) => (
        <View key={x.id} style={{ marginTop: 8 }}>
          <AddressReviewNote t={addressT} label={siteLabel(x)} onEdit={canEdit ? () => onEdit(x.id) : undefined} />
        </View>
      ))}
      {canEdit ? (
        <View style={{ marginTop: hasSites ? 12 : 0 }}>
          <AppButton label={s.sites.add} variant="outline" icon="plus" onPress={onAdd} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Pestaña Walkthrough (D-220): la lista de walkthroughs de los sitios (cita agendada, en curso o hecho, D-217) y los
 * botones Agendar walkthrough (con `leads_editar`) y Hacer walkthrough (con `walkthroughs_hacer`).
 */
function WalkthroughSection({
  lead,
  s,
  canEdit,
  canWalkthrough,
  onWalkthrough,
  onSchedule,
}: {
  lead: Lead;
  s: SalesStrings;
  canEdit: boolean;
  canWalkthrough: boolean;
  onWalkthrough: () => void;
  onSchedule: (siteId?: string) => void;
}) {
  const { colors } = useTheme();
  const w = useWalkthroughStrings();
  const hasSites = lead.sites.length > 0;
  return (
    <View>
      {!hasSites ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {canEdit ? s.sites.needSite : s.sites.empty}
        </AppText>
      ) : null}
      <LeadWalkthroughs
        leadId={lead.id}
        sites={lead.sites}
        canOpen={canWalkthrough}
        scheduleLine={(site) => (site.scheduled ? s.sites.walkthroughOn(formatDateTime(site.scheduled.startsAt, s)) : s.sites.noWalkthrough)}
        onSchedule={canEdit ? (siteId) => onSchedule(siteId) : undefined}
      />
      {hasSites && (canEdit || canWalkthrough) ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          {canEdit ? <AppButton label={s.sites.schedule} onPress={() => onSchedule()} /> : null}
          {canWalkthrough ? <AppButton label={w.start} variant="outline" onPress={onWalkthrough} /> : null}
        </View>
      ) : null}
    </View>
  );
}


/**
 * Tarjeta principal del lead (D-226, D-333 (7)): empresa, "Lead · Fuente", estado, Llamar (tel:), Correo (el único
 * botón de correo: abre las plantillas con la del paso, D-332 (5)) y Respondió (en frío, con `leads_editar`).
 */
function LeadMainCard({ lead, s, onMail, onResponded }: { lead: Lead; s: SalesStrings; onMail?: () => void; onResponded?: () => void }) {
  const { brand } = useTheme();
  const phone = lead.phone ? phoneDigits(lead.phone) : '';
  return (
    <Card tone="brand" wide style={{ padding: 18, gap: 12 }}>
      <View style={styles.mainHead}>
        <View style={{ gap: 4, flex: 1 }}>
          <AppText weight="heavy" size={24} color="#FFFFFF" accessibilityRole="header">
            {lead.company}
          </AppText>
          {lead.companyMissing ? (
            <AppText size={13} weight="bold" color="#FFFFFF">
              {s.detail.companyMissing}
            </AppText>
          ) : null}
          <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
            {s.detail.sourceLine(s.source[lead.source])}
          </AppText>
        </View>
        <View style={styles.mainChip}>
          <AppText size={12} weight="bold" color="#FFFFFF">
            {s.status[lead.status]}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ disabled: !phone }}
          onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined}
          style={[styles.mainButton, { backgroundColor: '#FFFFFF', opacity: phone ? 1 : 0.5 }]}
        >
          <Icon name="phone" size={18} strokeWidth={1.8} color={brand} />
          <AppText weight="bold" size={14} color={brand}>
            {s.detail.call}
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !onMail }} disabled={!onMail} onPress={onMail} style={[styles.mainButton, { backgroundColor: 'rgba(255,255,255,0.18)' }, !onMail ? { opacity: 0.4 } : null]}>
          <Icon name="mail" size={18} strokeWidth={1.8} color="#FFFFFF" />
          <AppText weight="bold" size={14} color="#FFFFFF">
            {s.detail.mail}
          </AppText>
        </Pressable>
        {onResponded ? (
          <Pressable accessibilityRole="button" onPress={onResponded} style={[styles.mainButton, { borderWidth: 1, borderColor: '#FFFFFF' }]}>
            <AppText weight="bold" size={14} color="#FFFFFF">
              {s.flow.responded}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

/** Tarjeta "Seguimiento" (D-333 (7)): la línea de tiempo con fechas y el siguiente paso en gris; en Sin respuesta, decidir. */
function FollowupCard({ lead, s, canEdit, onAsk }: { lead: Lead; s: SalesStrings; canEdit: boolean; onAsk: (a: FlowAsk) => void }) {
  const { colors, brand } = useTheme();
  const items = followupTimeline(lead, s);
  return (
    <Card wide style={{ gap: 8 }}>
      <AppText weight="heavy" size={15}>
        {s.flow.timeline}
      </AppText>
      {items.length === 0 ? (
        <AppText size={13} color={colors.secondary}>
          {s.flow.tlEmpty}
        </AppText>
      ) : (
        items.map((i) => (
          <View key={i.key} style={styles.tlRow}>
            <View style={[styles.tlDot, { backgroundColor: i.pending ? colors.border : brand }]} />
            <AppText size={13} color={i.pending ? colors.secondary : colors.text}>
              {`${dayMonth(i.day, s)} · ${i.label}`}
            </AppText>
          </View>
        ))
      )}
      {lead.status === 'no_response' ? (
        <AppText size={13} color={colors.secondary}>
          {s.flow.noResponseNote}
        </AppText>
      ) : null}
      {lead.status === 'no_response' ? (
        <LeadFlowButtons id={lead.id} company={lead.company} status={lead.status} canEdit={canEdit} s={s} onAsk={onAsk} hasEmail={!!lead.email} />
      ) : null}
    </Card>
  );
}

function TileText({ title, line, tone }: { title: string; line: string; tone: CardTone }) {
  const t = useCardText(tone);
  return (
    <View style={{ gap: 2 }}>
      <AppText weight="heavy" size={15} color={t.main}>
        {title}
      </AppText>
      <AppText size={12} color={t.soft} style={{ opacity: t.softOpacity }} numberOfLines={2}>
        {line}
      </AppText>
    </View>
  );
}

/** Resumen de la tarjeta Walkthrough: la próxima cita, "Walkthrough hecho" o "Sin walkthrough". */
function walkthroughLine(lead: Lead, s: SalesStrings, w: { siteDone: string }): string {
  const next = lead.sites
    .map((x) => x.scheduled?.startsAt)
    .filter((d): d is Date => d instanceof Date && d.getTime() >= Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (next) return formatDateTime(next, s);
  if (lead.sites.some((x) => x.walkthroughDone)) return w.siteDone;
  return s.sites.noWalkthrough;
}

/** Resumen de la tarjeta Quote: el estado y la versión del quote más avanzado, o "Sin quote todavía". */
function quoteLine(rows: SiteQuoteRow[] | null, s: SalesStrings, q: QuoteStrings): string {
  const withQuote = (rows ?? []).filter((r) => r.status);
  if (withQuote.length === 0) return s.detail.noQuote;
  const r = withQuote[0];
  return r.version ? `${q.status[r.status!]} · ${q.version(r.version)}` : q.status[r.status!];
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  tile: { gap: 10 },
  mainHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  mainChip: { borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  mainButton: { flex: 1, height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  // Lápiz y papelera de 18px con 14px entre ellos (muestra ronda 12, D-113).
  rowIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // Botón de texto rojo (D-201): mismo alto que los botones (40px), sin contorno.
  dangerText: { minHeight: sample.buttonMinHeight, alignItems: 'center', justifyContent: 'center' },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
