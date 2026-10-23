import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { ListRow } from '../ListRow';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { canAssign, canSetPay, paySummary, type Pay, type ProfileAssignment } from '@/lib/clientRules';
import { fetchPay, fetchProfileAssignments } from '@/lib/clientsApi';
import { formatDate } from '@/lib/employeeRules';
import { dateFromKey } from '@/lib/leadRules';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Pestaña Pagos del empleado (D-194, D-210): una fila por jobsite con su pago vigente y desde cuándo; tocarla abre el
 * mismo formulario de pago que Personal del jobsite. "Asignar a un jobsite" con permiso de asignar.
 */
export function EmployeePay({ profileId, workerType }: { profileId: string; workerType: 'w2' | '1099' | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const c = useClientsStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const [rows, setRows] = useState<ProfileAssignment[] | null>(null);
  const [pay, setPay] = useState<Map<string, Pay | null>>(new Map());
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([fetchProfileAssignments(profileId), fetchPay({ profile: profileId })]);
    if (!a.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(a.data);
    if (p.ok) setPay(p.data);
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const day = (key: string) => formatDate(dateFromKey(key).toISOString(), locale);
  const sumStrings = {
    perHour: c.pay.summaryHour,
    guaranteed: c.pay.summaryGuaranteed,
    visit: c.pay.summaryVisit,
    week: c.pay.summaryWeek,
    month: c.pay.summaryMonth,
    none: c.staff.noPay,
  };

  return (
    <View>
      {failed ? <AppAlert tone="error" text={c.staff.errorLoad} /> : null}
      {rows && rows.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
          {c.staff.empty}
        </AppText>
      ) : null}
      {rows?.map((r, i) => {
        const p = pay.get(r.assignmentId) ?? null;
        const dates = [c.staff.since(day(r.startDate)), r.endDate ? c.staff.until(day(r.endDate)) : null].filter(Boolean).join(' · ');
        const next = p?.nextChange ? ` · ${c.pay.nextChange(day(p.nextChange))}` : '';
        const open = canSetPay(access) && !r.endDate;
        return (
          <ListRow
            key={r.assignmentId}
            title={`${r.clientName} · ${r.jobsiteName}`}
            detail={`${paySummary(p, sumStrings)} · ${dates}${next}`}
            chevron={open}
            last={i === rows.length - 1}
            onPress={
              open
                ? () =>
                    router.push({
                      pathname: '/pay/[assignment]',
                      params: { assignment: r.assignmentId, jobsite: r.jobsiteName, profile: profileId, workerType: workerType ?? '' },
                    })
                : undefined
            }
          />
        );
      })}
      {canAssign(access) ? (
        <View style={{ marginTop: 12 }}>
          <AppButton
            label={c.staff.assignToJobsite}
            variant="outline"
            icon="plus"
            onPress={() => router.push({ pathname: '/assign', params: { profile: profileId } })}
          />
        </View>
      ) : null}
    </View>
  );
}
