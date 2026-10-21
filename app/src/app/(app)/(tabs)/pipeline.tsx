import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { ListRow } from '@/components/ListRow';
import { LeadStatusChip } from '@/components/sales/LeadStatusChip';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { canEditLeads, canSeeLeads, leadListDetail, statusTone, type LeadSummary } from '@/lib/leadRules';
import { fetchLeads } from '@/lib/leadsApi';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';
import { sample, useTheme } from '@/theme';

/**
 * Pipeline (D-132, D-133): lista compacta de leads (D-027), filas de 48px (D-177) con empresa, línea gris y
 * ficha de estado; el icono + de la barra crea un lead (como D-185) con `leads_editar`.
 */
export default function PipelineScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={strings.nav.pipeline}
        action={
          canEditLeads(access)
            ? { icon: 'plus', onPress: () => router.push('/leads/new'), accessibilityLabel: s.form.newTitle }
            : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {!allowed ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.noPermission}
          </AppText>
        ) : null}
        {failed ? <AppAlert tone="error" text={s.list.errorLoad} /> : null}
        {leads && leads.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {s.list.empty}
          </AppText>
        ) : null}
        {leads?.map((lead, i) => {
          const detail = leadListDetail(lead, s);
          return (
            <ListRow
              key={lead.id}
              title={lead.company}
              detail={detail === '' ? undefined : detail}
              right={<LeadStatusChip label={s.status[lead.status]} tone={statusTone(lead.status)} />}
              last={i === leads.length - 1}
              onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
