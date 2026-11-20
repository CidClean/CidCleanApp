import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AccountButton } from '@/components/AccountButton';
import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { TitleHeader } from '@/components/bento/Header';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  canCreateLegacy,
  canSeeAccounts,
  canSeeRate,
  filterAccounts,
  frequencyLabel,
  groupByClient,
  money,
  monthlyTotal,
  splitAccounts,
  statusTone,
  type AccountCard,
  type Jobsite,
} from '@/lib/clientRules';
import { fetchAccountsOverview, fetchAtRisk, fetchClients, fetchJobsites, fetchRates, type AccountsOverview } from '@/lib/clientsApi';
import { usePermissions } from '@/lib/session';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Tab = 'active' | 'archived';

/**
 * Accounts (D-337 (3), muestra navegacion-aprobado (2) y (3)): pestañas "Activas · N" y "Archivadas · N", buscador por
 * cliente o jobsite y una tarjeta por cliente con su total mensual (con tarifa), el chip de proveedor de cuentas
 * (D-291, sin mencionar su parte) y sus jobsites dentro (frecuencia, personal asignado y "desde"). Archivadas: jobsites
 * terminados (rango de fechas y "era $X/mes") y clientes sin jobsites sin terminar; se abren igual. Total mensual al
 * pie. El + crea un cliente previo a la app (D-210) y el avatar abre Mi cuenta.
 */
export default function AccountsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const [cards, setCards] = useState<{ active: AccountCard[]; archived: AccountCard[] } | null>(null);
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [risk, setRisk] = useState<Set<string>>(new Set());
  const [overview, setOverview] = useState<AccountsOverview>(new Map());
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const allowed = canSeeAccounts(access);
  const seesRate = canSeeRate(access);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      void (async () => {
        const [clients, jobsites, ov] = await Promise.all([fetchClients(), fetchJobsites(), fetchAccountsOverview()]);
        if (cancelled) return;
        if (!clients.ok || !jobsites.ok) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setCards(splitAccounts(groupByClient(jobsites.data, clients.data)));
        if (ov.ok) setOverview(ov.data);
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
  const list = cards ? filterAccounts(tab === 'active' ? cards.active : cards.archived, query) : [];
  const total = list.reduce((sum, card) => sum + monthlyTotal(card.jobsites, rates), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        back={strings.common.back}
        kicker={c.list.kicker}
        title={strings.nav.accounts}
        action={canCreateLegacy(access) ? { icon: 'plus', label: c.list.newClient, onPress: () => router.push('/clients/new') } : undefined}
        right={<AccountButton />}
      />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {cards ? (
          <Segmented
            options={[
              { value: 'active', label: c.list.tabActive(cards.active.length) },
              { value: 'archived', label: c.list.tabArchived(cards.archived.length) },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : null}
        {cards ? (
          <View style={[styles.search, { backgroundColor: colors.card }]}>
            <Icon name="search" size={18} strokeWidth={iconStrokeWidth} color={colors.secondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={c.list.search}
              placeholderTextColor={colors.secondary}
              accessibilityLabel={c.list.search}
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
        ) : null}
        {failed ? <AppAlert tone="error" text={c.list.errorLoad} /> : null}
        {cards === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
        {cards && list.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {query.trim() ? c.list.noResults : tab === 'archived' ? c.list.emptyArchived : c.list.empty}
          </AppText>
        ) : null}
        {list.map((card) => (
          <ClientCard
            key={`${tab}-${card.clientId}`}
            card={card}
            archived={tab === 'archived'}
            rates={rates}
            risk={risk}
            overview={overview}
            seesRate={seesRate}
          />
        ))}
        {seesRate && tab === 'active' && list.length > 0 ? (
          <View style={styles.total}>
            <AppText weight="bold" color={colors.secondary}>
              {c.list.monthlyTotal}
            </AppText>
            <AppText weight="heavy" size={17}>
              {money(total)}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ClientCard({
  card,
  archived,
  rates,
  risk,
  overview,
  seesRate,
}: {
  card: AccountCard;
  archived: boolean;
  rates: Map<string, number>;
  risk: Set<string>;
  overview: AccountsOverview;
  seesRate: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const c = useClientsStrings();
  const monthly = monthlyTotal(card.jobsites, rates);
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={card.clientName}
        onPress={() => router.push({ pathname: '/clients/[id]', params: { id: card.clientId } })}
        style={styles.head}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <AppText weight="heavy" size={15}>
            {card.clientName}
          </AppText>
          <View style={styles.chips}>
            {card.accountProvider ? <Chip label={c.accountProvider} /> : null}
            {archived ? <Chip label={card.inactiveClient ? c.list.inactiveClient : c.list.terminated} tone="neutral" /> : null}
          </View>
        </View>
        {!archived && seesRate ? (
          <AppText weight="heavy" style={{ fontVariant: ['tabular-nums'] }}>
            {c.list.perMo(money(monthly))}
          </AppText>
        ) : null}
      </Pressable>
      {card.jobsites.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {c.list.noJobsites}
        </AppText>
      ) : null}
      {card.jobsites.map((j) => (
        <SiteRow key={j.id} j={j} archived={archived} rate={seesRate ? rates.get(j.id) : undefined} atRisk={risk.has(j.id)} info={overview.get(j.id)} />
      ))}
    </View>
  );
}

function SiteRow({ j, archived, rate, atRisk, info }: { j: Jobsite; archived: boolean; rate: number | undefined; atRisk: boolean; info: { staff: number; endedOn: string | null } | undefined }) {
  const router = useRouter();
  const { colors, background } = useSiteColors();
  const c = useClientsStrings();
  const date = (d: string, withYear = false) => {
    const [y, m, day] = d.split('-');
    const text = `${c.list.months[Number(m) - 1] ?? ''} ${Number(day)}`;
    return withYear ? `${text}, ${y}` : text;
  };
  let detail: string;
  if (archived) {
    const range = j.oneTime && j.oneTimeOn
      ? `${c.list.oneTime} · ${date(j.oneTimeOn, true)}`
      : j.startDate && info?.endedOn ? c.list.range(date(j.startDate), date(info.endedOn, true)) : info?.endedOn ? `${c.list.ended} ${date(info.endedOn, true)}` : c.list.ended;
    detail = [range, rate !== undefined ? c.list.was(money(rate)) : null].filter(Boolean).join(' · ');
  } else {
    const freq = frequencyLabel(j.frequency, { daily: c.form.daily, other: c.form.other, days: c.form.days, and: c.form.and });
    detail = j.oneTime
      ? [j.oneTimeOn ? date(j.oneTimeOn) : null, info ? c.list.staff(info.staff) : null].filter(Boolean).join(' · ')
      : [freq, info ? c.list.staff(info.staff) : null, j.startDate ? c.list.since(date(j.startDate)) : null].filter(Boolean).join(' · ');
  }
  // Orden 162 (D-200): el proyecto one-time lleva la etiqueta One-time mientras no pasa su fecha.
  const chip = !archived && j.oneTime ? (
    <Chip label={c.list.oneTime} tone="brand" />
  ) : !archived && (j.status !== 'active' || atRisk) ? (
    <Chip label={atRisk && j.status === 'active' ? c.atRisk : c.status[j.status]} tone={atRisk && j.status === 'active' ? 'warning' : statusTone(j.status)} />
  ) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={j.name}
      onPress={() => router.push({ pathname: '/jobsites/[id]', params: { id: j.id } })}
      style={[styles.site, { backgroundColor: background }]}
    >
      <View style={[styles.dot, { backgroundColor: archived || j.status !== 'active' ? colors.border : colors.brandText }]} />
      <View style={{ flex: 1 }}>
        <AppText weight="bold" size={14}>
          {j.name}
        </AppText>
        {detail ? (
          <AppText size={12} color={colors.secondary}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {chip}
      <Icon name="chevron-right" size={16} strokeWidth={iconStrokeWidth} color={colors.secondary} />
    </Pressable>
  );
}

/** Fondo de cada jobsite dentro de la tarjeta: el crema de la pantalla (muestra `.site`). */
function useSiteColors() {
  const { colors } = useTheme();
  return { colors, background: colors.background };
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  card: { borderRadius: radius.card, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  site: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingTop: 4 },
});
