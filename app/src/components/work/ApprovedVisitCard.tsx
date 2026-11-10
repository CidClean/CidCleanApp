import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Card } from '../bento/Card';
import { Chip } from '../Chip';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { money } from '@/lib/accountingRules';
import { dateFromKey, formatShortDate } from '@/lib/leadRules';
import type { ApprovedCard, WorkRow } from '@/lib/scheduleApi';
import { formatMinutes, workedMinutes } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { can } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { useTheme } from '@/theme';

/**
 * Tarjeta de una visita aprobada en "Aprobados" (D-298): la misma tarjeta de To approve ("Cuenta · fecha", una fila por
 * persona con su día de servicio o sus horas y el monto si se ven pagos) en modo lectura, con la ficha verde
 * "Aprobado el {fecha} por {nombre}". Tocarla abre el detalle de la visita, donde el Super Admin corrige (D-262).
 */
export function ApprovedVisitCard({ card, onOpen }: { card: ApprovedCard; onOpen: () => void }) {
  const { colors } = useTheme();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const sd = useServiceDaysStrings();
  const { access } = usePermissions();
  const seesPay = can(access, 'empleados_ver_pagos');
  const title = t.cardTitle(card.client, formatShortDate(dateFromKey(card.day), s));
  const date = card.approvedAt ? formatShortDate(card.approvedAt, s) : '';
  const chip = card.approvedBy ? t.approvedOn(date, card.approvedBy) : date ? t.approvedOnNoName(date) : t.approved;

  const detail = (r: WorkRow) => {
    if (r.contractor) return r.serviceDay?.status === 'approved' ? sd.approved : r.serviceDay?.status === 'needs_correction' ? sd.needsCorrection : sd.pending;
    const line = t.timeRange(r.clockIn ? formatTime(r.clockIn) : t.missing, r.clockOut ? formatTime(r.clockOut) : t.missing);
    return r.clockIn && r.clockOut ? `${line} · ${formatMinutes(workedMinutes(r.clockIn, r.clockOut), t.hours)}` : line;
  };
  const amount = (r: WorkRow) => (r.contractor ? (r.serviceDay?.amount ?? r.payAmount ?? null) : (r.payAmount ?? null));

  return (
    <Card wide accessibilityLabel={title} onPress={onOpen} style={{ gap: 4, paddingVertical: 14 }}>
      <View style={{ gap: 6, marginBottom: 4 }}>
        <AppText weight="heavy" size={17}>
          {title}
        </AppText>
        {card.jobsite !== card.client ? (
          <AppText size={12} color={colors.secondary}>
            {card.jobsite}
          </AppText>
        ) : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Chip label={chip} tone="success" />
        </View>
      </View>
      {card.rows.map((r) => (
        <View key={r.profileId} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="bold">{r.name}</AppText>
            <AppText size={12} color={colors.secondary}>
              {detail(r)}
            </AppText>
          </View>
          {seesPay && amount(r) !== null ? (
            <AppText size={13} weight="bold">
              {money(amount(r) as number)}
            </AppText>
          ) : null}
        </View>
      ))}
      {card.noShow.map((p) => (
        <AppText key={p.profileId} size={12} color={colors.secondary} style={{ paddingTop: 4 }}>
          {`${p.name} · ${t.noShowList}`}
        </AppText>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 0.5 },
});
