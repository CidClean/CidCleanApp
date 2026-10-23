import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../AppText';
import { Chip } from '../Chip';
import { ListRow } from '../ListRow';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import type { LeadSite } from '@/lib/leadRules';
import { statusTone } from '@/lib/quoteRules';
import { fetchLeadQuotes, type SiteQuoteRow } from '@/lib/quotesApi';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Pestaña Sitios del lead (D-208): una fila "Quote · {sitio}" por sitio con su estado y versión; abre el quote.
 * Solo con permiso de ver, armar o enviar quotes.
 */
export function LeadQuotes({ leadId, sites }: { leadId: string; sites: readonly LeadSite[] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const q = useQuoteStrings();
  const { can } = usePermissions();
  const visible = can('quotes_ver') || can('quotes_editar') || can('quotes_enviar');
  const [rows, setRows] = useState<SiteQuoteRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      let cancelled = false;
      void fetchLeadQuotes(leadId).then((r) => {
        if (!cancelled && r.ok) setRows(r.data);
      });
      return () => {
        cancelled = true;
      };
    }, [leadId, visible]),
  );

  if (!visible || !rows || sites.length === 0) return null;
  const label = (s: LeadSite) => (s.name?.trim() ? s.name : s.address);
  return (
    <View style={{ marginTop: 14 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
        {q.sectionTitle}
      </AppText>
      {sites.map((site, i) => {
        const r = rows.find((x) => x.siteId === site.id);
        const open = r?.walkthroughClosed || r?.status;
        return (
          <ListRow
            key={site.id}
            title={q.siteQuote(label(site))}
            detail={r?.status && r.version ? q.version(r.version) : r?.walkthroughClosed ? q.noQuoteYet : q.needWalkthrough}
            right={r?.status ? <Chip label={q.status[r.status]} tone={statusTone(r.status)} /> : undefined}
            chevron={Boolean(open)}
            last={i === sites.length - 1}
            onPress={open ? () => router.push({ pathname: '/leads/[id]/quote/[siteId]', params: { id: leadId, siteId: site.id } }) : undefined}
          />
        );
      })}
    </View>
  );
}
