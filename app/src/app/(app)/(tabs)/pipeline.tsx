import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { TitleHeader } from '@/components/bento/Header';
import { LeadFlowButtons, LeadFlowDialog, LeadStatusChip, type FlowAsk } from '@/components/sales/LeadFlow';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import type { SalesStrings } from '@/i18n/sales';
import {
  LEAD_TABS,
  canEditLeads,
  canSeeLeads,
  leadStepLine,
  leadsInTab,
  tabCounts,
  type LeadSummary,
  type LeadTab,
} from '@/lib/leadRules';
import { fetchLeads } from '@/lib/leadsApi';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';
import { radius, sample, status, useTheme } from '@/theme';

const isTab = (v: unknown): v is LeadTab => typeof v === 'string' && (LEAD_TABS as readonly string[]).includes(v);

/**
 * Leads (D-333 (5), survey flujo-leads-aprobado, pantalla 2): pestañas Hoy, Por contactar, Esperando, En venta y
 * Cerrados con contador; lo más atrasado primero (D-200). Cada fila: empresa, contacto con el paso y la fecha, ficha
 * del estado y "Escribir" / "Respondió" (en Sin respuesta: "Reintentar" / "Marcar perdido"). Tocar la fila abre el lead.
 * + de marca para crear (con `leads_editar`, D-205). `tab` en la ruta abre una pestaña (Inicio → "Ver" abre Hoy).
 */
export default function LeadsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { colors } = useTheme();
  const s = useSalesStrings();
  const strings = useStrings();
  const { access } = usePermissions();
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<LeadTab>(isTab(params.tab) ? params.tab : 'today');
  const [ask, setAsk] = useState<FlowAsk | null>(null);
  const allowed = canSeeLeads(access);
  const canEdit = canEditLeads(access);

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab]);

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
  const shown = leadsInTab(leads ?? [], tab);
  const now = new Date();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        title={s.flow.title}
        action={canEdit ? { icon: 'plus', label: s.form.newTitle, onPress: () => router.push('/leads/new') } : undefined}
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
        {leads && leads.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.empty}
          </AppText>
        ) : null}
        {leads && leads.length > 0 && shown.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.flow.emptyTab}
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
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${lead.company}, ${s.status[lead.status]}`} onPress={onPress} style={styles.head}>
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
      <LeadFlowButtons id={lead.id} company={lead.company} status={lead.status} canEdit={canEdit} s={s} onAsk={onAsk} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  tabs: { gap: 6, paddingVertical: 12 },
  tab: { flexDirection: 'row', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center' },
  card: { borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
