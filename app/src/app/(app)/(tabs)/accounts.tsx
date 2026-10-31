import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { TitleHeader } from '@/components/bento/Header';
import { StatRow } from '@/components/bento/Stats';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canCreateLegacy, canSeeAccounts, canSeeRate, groupByClient, money, statusTone, type ClientGroup } from '@/lib/clientRules';
import { fetchAtRisk, fetchClients, fetchJobsites, fetchRates } from '@/lib/clientsApi';
import { usePermissions } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Cuentas (D-132, D-133): lista de jobsites agrupada por cliente (D-082, muestra ronda 9): título pequeño con el
 * cliente (tocarlo abre el Cliente) y debajo sus jobsites con la tarifa mensual (con permiso) y la ficha de estado;
 * "Margen en riesgo" en ámbar en lugar de Activo (D-097). El + crea un cliente previo a la app (D-210).
 */
export default function AccountsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const [groups, setGroups] = useState<ClientGroup[] | null>(null);
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [risk, setRisk] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const allowed = canSeeAccounts(access);
  const seesRate = canSeeRate(access);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      void (async () => {
        const [clients, jobsites] = await Promise.all([fetchClients(), fetchJobsites()]);
        if (cancelled) return;
        if (!clients.ok || !jobsites.ok) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setGroups(groupByClient(jobsites.data, clients.data));
        if (seesRate) {
          const [r, k] = await Promise.all([fetchRates(), fetchAtRisk()]);
          if (cancelled) return;
          if (r.ok) setRates(r.data);
          if (k.ok) setRisk(k.data);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [allowed, seesRate]),
  );

  if (!allowed) return <Redirect href="/" />;
  const allJobsites = (groups ?? []).flatMap((g) => g.jobsites);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        kicker={c.list.kicker}
        title={strings.nav.accounts}
        action={canCreateLegacy(access) ? { icon: 'plus', label: c.list.newClient, onPress: () => router.push('/clients/new') } : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
        {groups ? (
          <StatRow
            stats={[
              { value: allJobsites.filter((j) => j.status === 'active').length, label: c.list.statActive, tone: 'plain' },
              { value: allJobsites.filter((j) => j.status === 'paused').length, label: c.list.statPaused, tone: 'attention' },
              ...(seesRate ? [{ value: allJobsites.filter((j) => j.status === 'active' && risk.has(j.id)).length, label: c.list.statRisk, tone: 'brand' as const }] : []),
            ]}
          />
        ) : null}
        {failed ? <AppAlert tone="error" text={c.list.errorLoad} /> : null}
        {groups === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {groups && groups.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {c.list.empty}
          </AppText>
        ) : null}
        {groups?.map((g, gi) => (
          <View key={g.clientId}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/clients/[id]', params: { id: g.clientId } })}
              style={[styles.groupHead, { marginTop: gi === 0 ? 0 : 10 }]}
            >
              <AppText size={sample.labelSize} color={colors.secondary}>
                {g.clientName}
              </AppText>
              {g.accountProvider ? <Chip label={c.accountProvider} /> : null}
              <Icon name="chevron-right" size={14} strokeWidth={iconStrokeWidth} color={colors.secondary} />
            </Pressable>
            {g.jobsites.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ paddingVertical: 6 }}>
                {c.list.noJobsites}
              </AppText>
            ) : null}
            {g.jobsites.length > 0 ? (
            <CardBlock style={{ marginBottom: 0 }}>
            {g.jobsites.map((j, i) => {
              const rate = rates.get(j.id);
              const atRisk = j.status === 'active' && risk.has(j.id);
              return (
                <ListRow
                  key={j.id}
                  title={j.name}
                  detail={seesRate && rate !== undefined ? c.perMonth(money(rate)) : j.address}
                  right={<Chip label={atRisk ? c.atRisk : c.status[j.status]} tone={atRisk ? 'warning' : statusTone(j.status)} />}
                  last={i === g.jobsites.length - 1}
                  onPress={() => router.push({ pathname: '/jobsites/[id]', params: { id: j.id } })}
                />
              );
            })}
            </CardBlock>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
});
