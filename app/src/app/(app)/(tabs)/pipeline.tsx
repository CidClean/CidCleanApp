import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { TitleHeader } from '@/components/bento/Header';
import { Icon } from '@/components/Icon';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import type { SalesStrings } from '@/i18n/sales';
import {
  canEditLeads,
  canSeeLeads,
  dateFromKey,
  dayKey,
  filterPipeline,
  formatDateTime,
  formatShortDate,
  initialsOf,
  leadTone,
  pipelineCounts,
  type LeadSummary,
  type PipelineFilter,
} from '@/lib/leadRules';
import { fetchLeads } from '@/lib/leadsApi';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';
import { radius, sample, useTheme } from '@/theme';

/**
 * Pipeline (D-132, D-226; muestra surveys/estilo-c1-pantallas/Pipeline.html): "Ventas" y el título, + de marca para
 * crear (con `leads_editar`), tres cifras (Abiertos, Quote enviado, Ganados), filtros rápidos y cada lead en una
 * tarjeta con iniciales, estado en color y su dato clave (fecha del walkthrough o del seguimiento).
 */
export default function PipelineScreen() {
  const router = useRouter();
  const { colors, brand } = useTheme();
  const s = useSalesStrings();
  const strings = useStrings();
  const { access } = usePermissions();
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<PipelineFilter>('all');
  const allowed = canSeeLeads(access);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      void fetchLeads().then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setLeads(result.data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [allowed]),
  );

  if (!visibleTabs(access).includes('pipeline')) return <Redirect href="/" />;

  const counts = pipelineCounts(leads ?? []);
  const shown = filterPipeline(leads ?? [], filter, dayKey(new Date()));
  const stat = (value: number, label: string, tone: 'plain' | 'attention' | 'brand') => {
    const bg = tone === 'brand' ? brand : tone === 'attention' ? colors.attention : colors.card;
    const fg = tone === 'brand' ? '#FFFFFF' : colors.text;
    const sub = tone === 'brand' ? '#FFFFFF' : tone === 'attention' ? colors.attentionText : colors.secondary;
    return (
      <View style={[styles.stat, { backgroundColor: bg }]}>
        <AppText weight="heavy" size={22} color={fg}>
          {String(value)}
        </AppText>
        <AppText size={12} color={sub} style={tone === 'brand' ? { opacity: 0.85 } : undefined}>
          {label}
        </AppText>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        kicker={s.list.kicker}
        title={strings.nav.pipeline}
        action={canEditLeads(access) ? { icon: 'plus', label: s.form.newTitle, onPress: () => router.push('/leads/new') } : undefined}
      />
      <ScrollView contentContainerStyle={styles.page}>
        {!allowed ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.noPermission}
          </AppText>
        ) : null}
        {failed ? <AppAlert tone="error" text={s.list.errorLoad} /> : null}
        {leads === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {allowed && leads ? (
          <>
            <View style={styles.stats}>
              {stat(counts.open, s.list.open, 'plain')}
              {stat(counts.quoteSent, s.list.quoteSent, 'attention')}
              {stat(counts.won, s.list.won, 'brand')}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {(
                [
                  ['all', s.list.all],
                  ['followUpToday', s.list.followUpToday],
                  ['walkthrough', s.list.withWalkthrough],
                ] as const
              ).map(([key, label]) => {
                const on = filter === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFilter(key)}
                    style={[styles.filter, { backgroundColor: on ? colors.darkCard : colors.card }]}
                  >
                    <AppText size={13} weight={on ? 'bold' : 'regular'} color={on ? colors.darkCardText : colors.text}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
        {leads && leads.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.empty}
          </AppText>
        ) : null}
        {leads && leads.length > 0 && shown.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.noMatch}
          </AppText>
        ) : null}
        <View style={{ gap: 10 }}>
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} s={s} onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function LeadCard({ lead, s, onPress }: { lead: LeadSummary; s: SalesStrings; onPress: () => void }) {
  const { colors, brand } = useTheme();
  const tone = leadTone(lead.status);
  const won = tone === 'won';
  const tileBg = won ? 'rgba(255,255,255,0.18)' : tone === 'brand' ? colors.brandSoft : tone === 'attention' ? colors.attention : colors.surface;
  const tileFg = won ? '#FFFFFF' : tone === 'brand' ? colors.brandText : tone === 'attention' ? colors.attentionText : colors.secondary;
  const chipBg = won ? 'rgba(255,255,255,0.2)' : tileBg;
  const open = lead.status !== 'won' && lead.status !== 'lost';
  const contact = [lead.contactName, lead.source ? s.source[lead.source] : null].filter(Boolean).join(' · ');
  const follow = open && lead.followUpOn ? s.list.followUpOn(formatShortDate(dateFromKey(lead.followUpOn), s)) : null;
  const walk = open && lead.nextWalkthrough ? formatDateTime(lead.nextWalkthrough, s) : null;
  const sub = walk ? contact : (follow ?? contact);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lead.company}, ${s.status[lead.status]}`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: won ? brand : colors.card }]}
    >
      <View style={styles.cardHead}>
        <View style={styles.who}>
          <View style={[styles.initials, { backgroundColor: tileBg }]}>
            <AppText weight="heavy" color={tileFg}>
              {initialsOf(lead.company)}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText weight="heavy" size={16} color={won ? '#FFFFFF' : colors.text} numberOfLines={1}>
              {lead.company}
            </AppText>
            {sub ? (
              <AppText size={12} color={won ? '#FFFFFF' : colors.secondary} style={won ? { opacity: 0.85 } : undefined} numberOfLines={1}>
                {sub}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={[styles.chip, { backgroundColor: chipBg }]}>
          <AppText size={12} weight="bold" color={tileFg}>
            {s.status[lead.status]}
          </AppText>
        </View>
      </View>
      {walk ? (
        <View style={[styles.key, { backgroundColor: colors.surface }]}>
          <Icon name="calendar" size={16} strokeWidth={1.8} color={colors.brandText} />
          <AppText size={13}>{walk}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 20, padding: 12, gap: 2 },
  filters: { gap: 8, paddingVertical: 12 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  card: { borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  initials: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
});
