import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppText } from '../AppText';
import { Chip } from '../Chip';
import { Icon, type IconName } from '../Icon';
import { CardBlock } from '../bento/Card';
import { getDocumentsLibraryStrings } from '@/i18n/documentsLibrary';
import type { ClientsStrings } from '@/i18n/clients';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchDashboard } from '@/lib/accountingApi';
import { accountingAccess, monthKeyOf } from '@/lib/accountingRules';
import { monthMargin, type Jobsite } from '@/lib/clientRules';
import { fetchJobsiteHistory, fetchJobsiteLibrary, type JobsiteHistoryEntry, type Margin } from '@/lib/clientsApi';
import { rowTitle, viewerParams, type LibraryDoc } from '@/lib/documentsLibrary';
import { historyTime } from '@/lib/history';
import { downloadLibraryDoc } from '@/lib/libraryDownload';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/** Dinero sin centavos para las cifras grandes de la tarjeta del mes (muestra: "$8,615"). */
export function wholeMoney(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
}

// --- Botones rápidos ---------------------------------------------------------------------------------------

export type QuickAction = { key: string; icon: IconName; label: string; onPress?: () => void };

/** Call, Email, Maps y Schedule (D-340): cuatro botones iguales; sin destino se atenúan, como Llamar y Correo (D-228). */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.quickRow}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityState={{ disabled: !a.onPress }}
          onPress={a.onPress}
          style={[styles.quick, { backgroundColor: colors.card, opacity: a.onPress ? 1 : 0.45 }]}
        >
          <Icon name={a.icon} size={20} strokeWidth={iconStrokeWidth} color={brand} />
          <AppText weight="bold" size={12}>
            {a.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

// --- Pestañas ------------------------------------------------------------------------------------------------

export function DetailTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.tabs, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.value)}
            style={[styles.tab, { borderBottomColor: on ? brand : 'transparent' }]}
          >
            <AppText weight={on ? 'bold' : 'medium'} size={14} color={on ? colors.text : colors.secondary}>
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Tarjeta del mes -----------------------------------------------------------------------------------------

/**
 * Tarjeta del mes (D-340): tarifa, cobrado, personal y margen %, con la barra del personal sobre la tarifa. La tarifa
 * con clientes_ver_tarifa; el cobrado con el dashboard por cuenta (como la tarjeta de la orden 27); el personal y el
 * margen solo con empleados_ver_pagos (jobsite_margin solo devuelve el costo con ese permiso). Abre Accounting.
 */
export function MonthCard({ jobsiteId, rate, margin, c }: { jobsiteId: string; rate: number | null; margin: Margin | null; c: ClientsStrings }) {
  const router = useRouter();
  const { colors, status } = useTheme();
  const a = useAccountingStrings();
  const { access } = usePermissions();
  const allowed = accountingAccess(access).account;
  const month = monthKeyOf(new Date());
  const [received, setReceived] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      void fetchDashboard({ from: month, to: month }, jobsiteId).then((r) => !cancelled && r.ok && setReceived(r.data.received));
      return () => {
        cancelled = true;
      };
    }, [allowed, jobsiteId, month]),
  );

  if (rate === null) return null;
  const staff = margin?.cost ?? null;
  const m = monthMargin(rate, staff);
  const figures: { value: string; label: string }[] = [{ value: wholeMoney(rate), label: c.detail.rate }];
  if (received !== null) figures.push({ value: wholeMoney(received), label: c.detail.received });
  if (staff !== null) figures.push({ value: wholeMoney(staff), label: c.detail.staff });
  if (m) figures.push({ value: `${m.margin}%`, label: c.detail.margin });
  const monthName = a.months[Number(month.slice(5, 7)) - 1];
  const body = (
    <>
      <View style={styles.monthHead}>
        <AppText weight="bold" size={14}>
          {monthName}
        </AppText>
        {margin?.atRisk ? <Chip label={c.atRisk} tone="warning" /> : allowed ? <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.secondary} /> : null}
      </View>
      <View style={styles.figures}>
        {figures.map((f) => (
          <View key={f.label} style={styles.figure}>
            <AppText weight="heavy" size={18}>
              {f.value}
            </AppText>
            <AppText size={12} color={colors.secondary}>
              {f.label}
            </AppText>
          </View>
        ))}
      </View>
      {m ? (
        <>
          <View style={[styles.bar, { backgroundColor: colors.surface }]}>
            <View
              style={{
                width: `${Math.min(100, Math.max(0, m.staffShare))}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: margin?.atRisk ? status.warning : status.success,
              }}
            />
          </View>
          <AppText size={12} color={colors.secondary}>
            {c.detail.staffShare(m.staffShare)}
          </AppText>
        </>
      ) : null}
    </>
  );
  return allowed ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.openAccounting}
      onPress={() => router.push({ pathname: '/accounting', params: { from: month, to: month, jobsite: jobsiteId } })}
      style={[styles.monthCard, { backgroundColor: colors.card }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={[styles.monthCard, { backgroundColor: colors.card }]}>{body}</View>
  );
}

// --- Fila de datos con acción a la derecha -------------------------------------------------------------------

export function InfoRow({
  title,
  detail,
  action,
  children,
  last = false,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
  children?: React.ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{title}</AppText>
        {detail ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {detail}
          </AppText>
        ) : null}
        {children}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={8}>
          <AppText weight="bold" size={14} color={colors.brandText}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Dirección con el Plus Code plegado ("Plus Code ▸") y "Maps" (D-340). */
export function AddressRow({ address, plusCode, mapsUrl, c, last }: { address: string; plusCode: string | null; mapsUrl: string | null; c: ClientsStrings; last?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <InfoRow
      title={address.trim() || c.jobsite.none}
      action={mapsUrl ? { label: c.detail.maps, onPress: () => void Linking.openURL(mapsUrl) } : undefined}
      last={last}
    >
      {plusCode ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} hitSlop={6} style={styles.fold}>
          <AppText size={sample.noteSize} color={colors.secondary}>
            {open ? `${c.detail.plusCode}: ${plusCode}` : c.detail.plusCode}
          </AppText>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} strokeWidth={iconStrokeWidth} color={colors.secondary} />
        </Pressable>
      ) : null}
    </InfoRow>
  );
}

// --- Documents ----------------------------------------------------------------------------------------------

/** Documents del jobsite (D-340): contrato, SOW, walkthrough y quotes del jobsite y de su cliente; abrir y descargar. */
export function JobsiteLibrary({ jobsiteId, c, reloadKey = 0 }: { jobsiteId: string; c: ClientsStrings; reloadKey?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale } = useSession();
  const lang = locale === 'en' ? 'en' : 'es';
  const t = getDocumentsLibraryStrings(lang);
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openError, setOpenError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchJobsiteLibrary(jobsiteId).then((r) => {
        if (cancelled) return;
        setFailed(!r.ok);
        if (r.ok) setDocs(r.data);
      });
      return () => {
        cancelled = true;
      };
    }, [jobsiteId, reloadKey]),
  );

  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(iso)) : '';

  return (
    <View style={{ gap: 10 }}>
      {failed ? <AppAlert tone="error" text={c.detail.docsError} /> : null}
      {openError ? <AppAlert tone="error" text={t.errorOpen} /> : null}
      {docs && docs.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {c.detail.docsEmpty}
        </AppText>
      ) : null}
      {docs && docs.length > 0 ? (
        <CardBlock>
          {docs.map((d, i) => (
            <View key={`${d.kind}:${d.id}`} style={[styles.docRow, i < docs.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${c.detail.open} ${rowTitle(d, t)}`}
                onPress={() => router.push({ pathname: '/viewer', params: viewerParams(d, rowTitle(d, t), lang) })}
                style={{ flex: 1, gap: 2 }}
              >
                <AppText weight="bold" numberOfLines={1}>
                  {rowTitle(d, t)}
                </AppText>
                <AppText size={12} color={colors.secondary} numberOfLines={1}>
                  {date(d.date)}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t.download} ${rowTitle(d, t)}`}
                hitSlop={8}
                onPress={() => {
                  setOpenError(false);
                  void downloadLibraryDoc(d, rowTitle(d, t), lang).then((ok) => !ok && setOpenError(true));
                }}
              >
                <AppText weight="bold" color={colors.brandText}>
                  {t.download}
                </AppText>
              </Pressable>
            </View>
          ))}
        </CardBlock>
      ) : null}
    </View>
  );
}

// --- History ------------------------------------------------------------------------------------------------

/** Título de una fila del History del jobsite; lo que no es del jobsite usa el título genérico. */
export function jobsiteHistoryTitle(e: JobsiteHistoryEntry, c: ClientsStrings, h: { unknown: string; jobsiteCreated: string }): string {
  const d = c.detail;
  const info = e.info as { plantilla?: string; despues?: string; version?: number | string };
  switch (e.action) {
    case 'correo_plantilla':
      return d.emailSent(info.plantilla ?? '');
    case 'quote_recordatorio':
      return d.emailSent(`Quote v${info.version ?? ''}`.trim());
    case 'jobsite_estado_cambiado':
      return d.statusChanged(info.despues === 'active' || info.despues === 'paused' || info.despues === 'terminated' ? c.status[info.despues] : '');
    case 'jobsite_reactivado':
      return d.reactivated;
    case 'jobsite_creado':
      return h.jobsiteCreated;
    case 'tarifa_cambiada':
      return d.rateChanged;
    case 'personal_asignado':
      return d.staffAssigned;
    case 'personal_quitado':
      return d.staffRemoved;
    case 'pago_definido':
      return d.payDefined;
    case 'horario_jobsite_cambiado':
      return d.scheduleChanged;
    case 'ingreso_generado':
      return d.incomeGenerated;
    case 'ingreso_ajustado':
      return d.incomeAdjusted;
    case 'ingreso_recibido':
      return d.incomeReceived;
    case 'ingreso_pendiente':
      return d.incomePending;
    case 'ingreso_extra_agregado':
      return d.extraIncome;
    case 'tipo_limpieza_cambiado':
      return d.cleaningType;
    case 'contrato_pendiente':
      return d.contractPending;
    default:
      return h.unknown;
  }
}

export function JobsiteHistory({ jobsiteId, c }: { jobsiteId: string; c: ClientsStrings }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const { locale } = useSession();
  const [rows, setRows] = useState<JobsiteHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchJobsiteHistory(jobsiteId).then((r) => {
        if (cancelled) return;
        setFailed(!r.ok);
        if (r.ok) setRows(r.data);
      });
      return () => {
        cancelled = true;
      };
    }, [jobsiteId]),
  );

  const now = new Date();
  return (
    <View style={{ gap: 10 }}>
      {failed ? <AppAlert tone="error" text={c.detail.historyError} /> : null}
      {rows && rows.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary}>
          {c.detail.historyEmpty}
        </AppText>
      ) : null}
      {rows && rows.length > 0 ? (
        <CardBlock>
          {rows.map((e, i) => (
            <View key={e.id} style={[styles.historyRow, { borderBottomColor: colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : 0.5 }]}>
              <View style={{ flex: 1 }}>
                <AppText weight="medium">{jobsiteHistoryTitle(e, c, strings.history)}</AppText>
                {e.actor ? (
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {strings.history.by(e.actor)}
                  </AppText>
                ) : null}
              </View>
              <AppText size={sample.noteSize} color={colors.secondary} numberOfLines={1}>
                {historyTime(strings, locale, e.at, now)}
              </AppText>
            </View>
          ))}
        </CardBlock>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quick: { flex: 1, minHeight: 60, borderRadius: radius.card - 6, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, marginBottom: 12 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
  monthCard: { borderRadius: radius.card, padding: 16, gap: 10, marginBottom: 12 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  figures: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  figure: { flexBasis: '25%', flexGrow: 1, minWidth: 70 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  infoRow: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  historyRow: { minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
