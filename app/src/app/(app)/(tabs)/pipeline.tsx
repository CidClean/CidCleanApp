import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { AccountButton } from '@/components/AccountButton';
import { TitleHeader } from '@/components/bento/Header';
import { LeadFlowButtons, LeadFlowDialog, LeadStatusChip, SmallButton, useWriteToLead, type FlowAsk } from '@/components/sales/LeadFlow';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import type { SalesStrings } from '@/i18n/sales';
import {
  LEAD_TABS,
  ORIGIN_COLORS,
  ORIGIN_FILTERS,
  canEditLeads,
  filterByOrigin,
  isPotential,
  originCounts,
  serviceChip,
  sourceChip,
  canSeeLeads,
  leadStepLine,
  leadsInTab,
  tabCounts,
  type LeadSummary,
  type LeadTab,
  type OriginFilter,
} from '@/lib/leadRules';
import { fetchLeads } from '@/lib/leadsApi';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';
import { radius, sample, status, useTheme } from '@/theme';

const isTab = (v: unknown): v is LeadTab => typeof v === 'string' && (LEAD_TABS as readonly string[]).includes(v);
const isOrigin = (v: unknown): v is OriginFilter => typeof v === 'string' && (ORIGIN_FILTERS as readonly string[]).includes(v);



/**
 * Leads (D-333 (5), survey flujo-leads-aprobado, pantalla 2): pestañas Hoy, Por contactar, Esperando, En venta y
 * Cerrados con contador; lo más atrasado primero (D-200). Cada fila: empresa, contacto con el paso y la fecha, ficha
 * del estado y "Escribir" / "Respondió" (en Sin respuesta: "Reintentar" / "Marcar perdido"). Tocar la fila abre el lead.
 * + de marca para crear (con `leads_editar`, D-205). `tab` en la ruta abre una pestaña (Inicio → "Ver" abre Hoy).
 */
export default function LeadsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; filter?: string }>();
  const { colors } = useTheme();
  const s = useSalesStrings();
  const strings = useStrings();
  const { access } = usePermissions();
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<LeadTab>(isTab(params.tab) ? params.tab : 'today');
  const [ask, setAsk] = useState<FlowAsk | null>(null);
  // D-350: filtro All / Potential · N / Cold · N dentro de la pestaña; `filter` en la ruta lo abre (Inicio → Potential).
  const [origin, setOrigin] = useState<OriginFilter>(isOrigin(params.filter) ? params.filter : 'all');
  const allowed = canSeeLeads(access);
  const canEdit = canEditLeads(access);

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
    if (isOrigin(params.filter)) setOrigin(params.filter);
  }, [params.tab, params.filter]);

  const load = useCallback(async () => {
    const result = await fetchLeads();
    if (result.ok) {
      setLeads(result.data);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) void load();
    }, [allowed, load]),
  );

  if (!visibleTabs(access).includes('pipeline')) return <Redirect href="/" />;

  const counts = tabCounts(leads ?? []);
  const inTab = leadsInTab(leads ?? [], tab);
  const oc = originCounts(inTab);
  const shown = filterByOrigin(inTab, origin);
  const now = new Date();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        back={strings.common.back}
        title={s.flow.title}
        action={canEdit ? { icon: 'plus', label: s.form.newTitle, onPress: () => router.push('/leads/new') } : undefined}
        right={<AccountButton />}
      />
      <ScrollView contentContainerStyle={styles.page}>
        {!allowed ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.noPermission}
          </AppText>
        ) : null}
        {failed ? <AppAlert tone="error" text={s.list.errorLoad} /> : null}
        {allowed && leads === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {allowed && leads ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {LEAD_TABS.map((key) => {
              const on = tab === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${s.flow.tabs[key]} ${counts[key]}`}
                  onPress={() => setTab(key)}
                  style={[styles.tab, { backgroundColor: on ? colors.darkCard : colors.card }]}
                >
                  <AppText size={13} weight="heavy" color={on ? colors.darkCardText : colors.text}>
                    {s.flow.tabs[key]}
                  </AppText>
                  <AppText size={13} weight="heavy" color={on ? colors.darkCardText : colors.secondary} style={{ opacity: 0.75 }}>
                    {String(counts[key])}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {allowed && leads ? (
          <View style={styles.origin} accessibilityRole="tablist">
            {ORIGIN_FILTERS.map((key) => {
              const on = origin === key;
              const label = key === 'all' ? s.origin.all : s.origin.filterCount(s.origin[key], oc[key]);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  onPress={() => setOrigin(key)}
                  style={[styles.originItem, { backgroundColor: on ? colors.card : 'transparent' }]}
                >
                  <AppText size={12} weight="heavy" color={on ? colors.text : colors.secondary} center>
                    {label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {leads && leads.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.empty}
          </AppText>
        ) : null}
        {leads && leads.length > 0 && shown.length === 0 && inTab.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.flow.emptyTab}
          </AppText>
        ) : null}
        {inTab.length > 0 && shown.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.noMatch}
          </AppText>
        ) : null}
        <View style={{ gap: 10 }}>
          {shown.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              line={leadStepLine(lead, now, s)}
              s={s}
              canEdit={canEdit}
              onAsk={setAsk}
              onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })}
            />
          ))}
        </View>
      </ScrollView>
      <LeadFlowDialog
        ask={ask}
        s={s}
        onClose={() => setAsk(null)}
        onDone={() => {
          setAsk(null);
          void load();
        }}
      />
    </View>
  );
}

function LeadRow({
  lead,
  line,
  s,
  canEdit,
  onAsk,
  onPress,
}: {
  lead: LeadSummary;
  line: string;
  s: SalesStrings;
  canEdit: boolean;
  onAsk: (a: FlowAsk) => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const write = useWriteToLead();
  const potential = isPotential(lead);
  const source = sourceChip(lead, s);
  const open = lead.status !== 'won' && lead.status !== 'lost';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card },
        // D-350: franja izquierda de 4px #E08A1E en el potencial.
        potential ? { borderLeftWidth: 4, borderLeftColor: ORIGIN_COLORS.potentialStripe } : null,
      ]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${lead.company}, ${potential ? s.origin.potential : s.origin.cold}, ${s.status[lead.status]}`} onPress={onPress} style={styles.head}>
        <View style={{ flex: 1 }}>
          <AppText weight="heavy" size={16} numberOfLines={1}>
            {lead.company}
          </AppText>
          {lead.companyMissing ? (
            <AppText size={12} weight="bold" color={status.warning} numberOfLines={1}>
              {s.detail.companyMissing}
            </AppText>
          ) : null}
          {line ? (
            <AppText size={12} color={colors.secondary} numberOfLines={1}>
              {line}
            </AppText>
          ) : null}
        </View>
        <LeadStatusChip status={lead.status} s={s} />
      </Pressable>
      <View style={styles.chips}>
        <Tag
          label={potential ? s.origin.potential : s.origin.cold}
          bg={potential ? ORIGIN_COLORS.potentialBg : ORIGIN_COLORS.coldBg}
          fg={potential ? ORIGIN_COLORS.potentialText : ORIGIN_COLORS.coldText}
        />
        {source ? <Tag label={source} bg={ORIGIN_COLORS.chipBg} fg={ORIGIN_COLORS.chipText} /> : null}
        <Tag label={serviceChip(lead, s)} bg={ORIGIN_COLORS.chipBg} fg={ORIGIN_COLORS.chipText} />
      </View>
      {potential && open ? (
        // D-350: la acción principal del potencial es "Call" (ya mostró interés); luego "Write".
        <View style={styles.actions}>
          {lead.phone ? <SmallButton label={s.origin.call} primary onPress={() => void Linking.openURL(`tel:${lead.phone}`)} /> : null}
          <SmallButton label={s.flow.write} primary={!lead.phone} disabled={!lead.email} onPress={() => write(lead.id, lead.status)} />
        </View>
      ) : (
        <LeadFlowButtons id={lead.id} company={lead.company} status={lead.status} canEdit={canEdit} s={s} onAsk={onAsk} hasEmail={!!lead.email} />
      )}
    </View>
  );
}

/** Etiqueta y chips de la fila (D-350): fondo y texto exactos. */
function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <AppText size={11} weight="heavy" color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, marginBottom: 10, backgroundColor: 'rgba(0,0,0,0.05)' },
  originItem: { flex: 1, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  tabs: { gap: 6, paddingVertical: 12 },
  tab: { flexDirection: 'row', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center' },
  card: { borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
