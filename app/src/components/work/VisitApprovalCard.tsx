import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Card } from '../bento/Card';
import { Chip } from '../Chip';
import { Dialog } from '../Dialog';
import type { Clock } from '../PickerField';
import { Sheet } from '../Sheet';
import { ClockField, clockOf } from './ClockField';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { money, parseMoney } from '@/lib/accountingRules';
import { approveServiceDay, editServiceDayAmount, recordAndApproveServiceDay, returnServiceDay } from '@/lib/serviceDays';
import { dateFromKey, formatShortDate } from '@/lib/leadRules';
import {
  approveVisit,
  editWorkEntry,
  fetchAddableStaff,
  markNoShow,
  recordWork,
  reviewGps,
  undoNoShow,
  type VisitCard,
  type WorkFailure,
  type WorkRow,
} from '@/lib/scheduleApi';
import { atTime, clockOutAfter, formatMinutes, workedMinutes } from '@/lib/scheduleRules';
import { usePermissions } from '@/lib/session';
import { can } from '@/lib/visibility';
import { formatTime } from '@/lib/week';
import { sample, useTheme } from '@/theme';

type Editing = { profileId: string; name: string; entryId: string | null } | null;
type Props = {
  card: VisitCard;
  /** Después de cualquier cambio: volver a cargar. */
  onChanged: () => void | Promise<void>;
  onError: (message: string | null) => void;
  /** Después de aprobar (si no se da, se usa onChanged). */
  onApproved?: () => void;
};

/**
 * Tarjeta de una visita en "To approve" (D-266, `surveys/por-aprobar-por-visita-aprobado.html`): "Cuenta · fecha", una
 * fila por persona con nombre, fichas y horario, y en cada fila "Edit" (las horas, como el lápiz de D-109) y "No show"
 * (con confirmación, D-200); "+ Agregar persona" (cualquier empleado activo, también el sustituto) y "Approve" de la
 * visita. Aviso ámbar si la persona no tiene pago asignado ese día (D-200). En una visita aprobada solo el Super Admin
 * sigue viendo Edit, No show y Agregar persona (D-262). La usan "To approve" y el detalle de la visita.
 * Los 1099 (D-286 (3)): quien marcó, "Aprobar" · "Devolver" (nota obligatoria); quien no marcó o no tiene acceso,
 * ficha "Sin acceso a la app" y "Registrar y aprobar" · "No show"; "Editar monto" para casos especiales (D-276).
 */
export function VisitApprovalCard({ card, onChanged, onError, onApproved }: Props) {
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const t = useWorkStrings();
  const sd = useServiceDaysStrings();
  const { access } = usePermissions();
  const [editing, setEditing] = useState<Editing>(null);
  const [inTime, setInTime] = useState<Clock | null>(null);
  const [outTime, setOutTime] = useState<Clock | null>(null);
  const [noShow, setNoShow] = useState<WorkRow | null>(null);
  const [adding, setAdding] = useState<{ id: string; name: string; hasPay: boolean; contractor: boolean }[] | null>(null);
  const [returning, setReturning] = useState<WorkRow | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [amountFor, setAmountFor] = useState<WorkRow | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amountNote, setAmountNote] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // D-262: una visita aprobada solo la corrige el Super Admin.
  const open = !card.approved || access.isSuperAdmin;
  const canRecord = open && can(access, 'work_registrar_por_otros');
  const canEdit = open && can(access, 'work_editar');
  const end = new Date(card.startsAt.getTime() + card.minutes * 60000);

  const canApprove = can(access, 'work_aprobar');
  const seesPay = can(access, 'empleados_ver_pagos');
  const canAmount = (r: WorkRow) =>
    !!r.serviceDay && can(access, 'work_editar') && seesPay && (r.serviceDay.status !== 'approved' || access.isSuperAdmin);
  const hasW2 = card.rows.some((r) => !r.contractor);

  const failText = (r: WorkFailure) =>
    r === 'service_days_pending'
      ? sd.errorPendingDays
      : r === 'already_approved'
        ? sd.errorApproved
        : r === 'open_shift' ? t.errorOpen : r === 'gps_pending' ? t.errorGps : r === 'missing_time' ? t.errorMissing : r === 'no_work' ? t.errorNoWork : t.errorSave;

  async function run(action: () => Promise<{ ok: boolean; reason?: WorkFailure }>) {
    setBusy(true);
    const r = await action();
    setBusy(false);
    onError(r.ok ? null : failText(r.reason ?? 'server'));
    await onChanged();
    return r.ok;
  }

  function openEdit(row: { profileId: string; name: string; entryId: string | null; clockIn: Date | null; clockOut: Date | null }) {
    setEditing({ profileId: row.profileId, name: row.name, entryId: row.entryId });
    setInTime(clockOf(row.clockIn ?? card.startsAt));
    setOutTime(clockOf(row.clockOut ?? end));
  }

  async function saveHours() {
    if (!editing || !inTime) return;
    const cin = atTime(card.day, inTime.hours, inTime.minutes);
    // D-241: una salida antes o igual que la entrada es del día siguiente (turno de 11:00 PM a 3:00 AM).
    const cout = outTime ? clockOutAfter(cin, atTime(card.day, outTime.hours, outTime.minutes)) : null;
    const e = editing;
    setEditing(null);
    await run(() =>
      e.entryId ? editWorkEntry(e.entryId, cin, cout) : recordWork(card.id, [{ profileId: e.profileId, clockIn: cin, clockOut: cout }]),
    );
  }

  function openReturn(r: WorkRow) {
    setReturning(r);
    setReturnNote('');
    setDialogError(null);
  }

  async function sendReturn() {
    const r = returning;
    if (!r?.serviceDay) return;
    if (!returnNote.trim()) {
      setDialogError(sd.noteRequired);
      return;
    }
    setReturning(null);
    await run(() => returnServiceDay(r.serviceDay?.id as string, returnNote.trim()));
  }

  function openAmount(r: WorkRow) {
    setAmountFor(r);
    const cur = r.serviceDay?.amount ?? r.serviceDay?.expectedAmount;
    setAmountText(cur === null || cur === undefined ? '' : cur.toFixed(2));
    setAmountNote('');
    setDialogError(null);
  }

  async function sendAmount() {
    const r = amountFor;
    const amount = parseMoney(amountText);
    if (!r?.serviceDay || amount === null || !amountNote.trim()) {
      setDialogError(sd.amountInvalid);
      return;
    }
    setAmountFor(null);
    await run(() => editServiceDayAmount(r.serviceDay?.id as string, amount, amountNote.trim()));
  }

  async function openAdd() {
    const r = await fetchAddableStaff(card.id);
    if (!r.ok) {
      onError(t.errorLoad);
      return;
    }
    setAdding(r.data);
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    const r = await approveVisit(card.id);
    setBusy(false);
    if (!r.ok) {
      onError(failText(r.reason));
      return;
    }
    onError(null);
    if (onApproved) onApproved();
    else await onChanged();
  }

  const title = t.cardTitle(card.client, formatShortDate(dateFromKey(card.day), s));
  const timeText = (r: WorkRow) => {
    const line = t.timeRange(r.clockIn ? formatTime(r.clockIn) : t.missing, r.clockOut ? formatTime(r.clockOut) : t.missing);
    return r.clockIn && r.clockOut ? `${line} · ${formatMinutes(workedMinutes(r.clockIn, r.clockOut), t.hours)}` : line;
  };

  return (
    <Card wide accessibilityLabel={title} style={{ gap: 4, paddingVertical: 14 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <AppText weight="heavy" size={17}>
            {title}
          </AppText>
          {card.jobsite !== card.client ? (
            <AppText size={12} color={colors.secondary}>
              {card.jobsite}
            </AppText>
          ) : null}
        </View>
        {card.approved ? <Chip label={t.approved} tone="success" /> : card.urgent ? <Chip label={t.urgent} tone="warning" /> : null}
      </View>

      {card.rows.map((r) =>
        r.contractor ? (
          <View key={r.profileId} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold">{r.name}</AppText>
              <View style={styles.chips}>
                {r.serviceDay?.status === 'approved' ? <Chip label={sd.approved} tone="success" /> : null}
                {r.serviceDay?.status === 'needs_correction' ? <Chip label={sd.needsCorrection} tone="warning" /> : null}
                {!r.serviceDay && !r.hasAppAccess ? <Chip label={sd.noAccess} tone="warning" /> : null}
                {r.unscheduled ? <Chip label={t.unscheduled} tone="warning" /> : null}
                {r.serviceDay?.amountEdited ? <Chip label={sd.editedChip} tone="neutral" /> : null}
              </View>
              <AppText size={12} color={colors.secondary}>
                {r.serviceDay?.selfMarked && r.serviceDay.markedAt
                  ? sd.markedAt(formatTime(r.serviceDay.markedAt))
                  : r.serviceDay
                    ? ''
                    : r.hasAppAccess
                      ? sd.notMarked
                      : sd.scheduled}
              </AppText>
              {r.serviceDay?.status === 'needs_correction' && r.serviceDay.note ? (
                <AppText size={12} color={colors.attentionText}>
                  {r.serviceDay.note}
                </AppText>
              ) : null}
              {seesPay && r.serviceDay && (r.serviceDay.amount ?? r.serviceDay.expectedAmount) !== null ? (
                <AppText size={12} color={colors.secondary}>
                  {money(r.serviceDay.amount ?? r.serviceDay.expectedAmount)}
                </AppText>
              ) : null}
              {!r.hasPay ? (
                <View style={[styles.warn, { backgroundColor: colors.attention }]}>
                  <AppText size={12} weight="bold" color={colors.attentionText}>
                    {t.noPay}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={[styles.actions, { flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '55%' }]}>
              {r.serviceDay?.status === 'pending' && canApprove ? (
                <>
                  <ActionLink label={sd.approve} a11y={`${sd.approve} ${r.name}`} onPress={() => void run(() => approveServiceDay(r.serviceDay?.id as string))} />
                  <ActionLink label={sd.giveBack} a11y={`${sd.giveBack} ${r.name}`} onPress={() => openReturn(r)} />
                </>
              ) : null}
              {r.serviceDay?.status === 'approved' && canApprove && access.isSuperAdmin ? (
                <ActionLink label={sd.giveBack} a11y={`${sd.giveBack} ${r.name}`} onPress={() => openReturn(r)} />
              ) : null}
              {!r.serviceDay && canRecord && canApprove ? (
                <ActionLink label={sd.recordApprove} a11y={`${sd.recordApprove} ${r.name}`} onPress={() => void run(() => recordAndApproveServiceDay(card.id, r.profileId))} />
              ) : null}
              {canAmount(r) ? <ActionLink label={sd.editAmount} a11y={`${sd.editAmount} ${r.name}`} onPress={() => openAmount(r)} /> : null}
              {canRecord && (r.serviceDay?.status !== 'approved' || access.isSuperAdmin) ? (
                <ActionLink label={t.rowNoShow} a11y={`${t.rowNoShow} ${r.name}`} onPress={() => setNoShow(r)} />
              ) : null}
            </View>
          </View>
        ) : (
        <View key={r.profileId} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="bold">{r.name}</AppText>
            <View style={styles.chips}>
              {r.status === 'auto' ? <Chip label={t.autoChip} tone="warning" /> : null}
              {!r.clockIn ? <Chip label={t.missingIn} tone="warning" /> : null}
              {r.clockIn && !r.clockOut ? <Chip label={t.missingOut} tone="warning" /> : null}
              {r.gpsPending ? <Chip label={t.gpsOut} tone="warning" /> : null}
              {r.gpsReviewed ? <Chip label={t.gpsReviewed} tone="success" /> : null}
              {r.inStatus === 'no_location' || r.outStatus === 'no_location' ? <Chip label={t.noLocation} tone="warning" /> : null}
              {r.offline ? <Chip label={t.offline} tone="warning" /> : null}
              {r.unscheduled ? <Chip label={t.unscheduled} tone="warning" /> : null}
              {r.manual && r.status !== 'auto' ? <Chip label={t.manual} tone="neutral" /> : null}
            </View>
            <AppText size={12} color={colors.secondary}>
              {timeText(r)}
            </AppText>
            {r.gpsPending && r.distanceM !== null ? (
              <AppText size={12} color={colors.attentionText}>
                {t.distance(r.distanceM)}
              </AppText>
            ) : null}
            {!r.hasPay ? (
              <View style={[styles.warn, { backgroundColor: colors.attention }]}>
                <AppText size={12} weight="bold" color={colors.attentionText}>
                  {t.noPay}
                </AppText>
              </View>
            ) : null}
            {r.gpsPending && r.entryId && !card.approved && can(access, 'work_revisar_gps') ? (
              <View style={{ marginTop: 6 }}>
                <AppButton label={t.reviewGps} variant="outline" onPress={() => void run(() => reviewGps(r.entryId as string))} />
              </View>
            ) : null}
          </View>
          <View style={styles.actions}>
            {(r.entryId ? canEdit : canRecord) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t.editHours(r.name)} onPress={() => openEdit(r)} hitSlop={8}>
                <AppText size={13} weight="heavy" color={colors.brandText}>
                  {t.rowEdit}
                </AppText>
              </Pressable>
            ) : null}
            {canRecord ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${t.rowNoShow} ${r.name}`} onPress={() => setNoShow(r)} hitSlop={8}>
                <AppText size={13} weight="heavy" color={colors.brandText}>
                  {t.rowNoShow}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        ),
      )}

      {card.noShow.length > 0 ? (
        <View style={{ gap: 4, paddingTop: 6 }}>
          {card.noShow.map((p) => (
            <View key={p.profileId} style={styles.noShowRow}>
              <AppText size={12} color={colors.secondary} style={{ flex: 1 }}>
                {`${p.name} · ${t.noShowList}`}
              </AppText>
              {canRecord ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${t.undo} ${p.name}`} onPress={() => void run(() => undoNoShow(card.id, p.profileId))} hitSlop={8}>
                  <AppText size={12} weight="heavy" color={colors.brandText}>
                    {t.undo}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canRecord ? (
        <Pressable accessibilityRole="button" onPress={() => void openAdd()} style={{ paddingVertical: 10 }}>
          <AppText weight="heavy" color={colors.brandText}>
            {t.addPersonCard}
          </AppText>
        </Pressable>
      ) : null}

      {!card.approved && canApprove && hasW2 ? (
        <AppButton label={t.approveCard} onPress={() => void approve()} disabled={busy || card.rows.length === 0} />
      ) : null}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {editing ? t.editHours(editing.name) : ''}
        </AppText>
        <ClockField label={t.clockInLabel} value={inTime} onChange={setInTime} />
        <ClockField label={t.clockOutLabel} value={outTime} onChange={setOutTime} />
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setEditing(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={t.save} onPress={() => void saveHours()} disabled={busy} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={adding !== null} onClose={() => setAdding(null)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {t.addPersonTitle}
        </AppText>
        {adding && adding.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {t.noOneToAdd}
          </AppText>
        ) : null}
        {(adding ?? []).map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => {
              setAdding(null);
              // D-275: al 1099 no se le registran horas; se registra y aprueba su día.
              if (p.contractor) void run(() => recordAndApproveServiceDay(card.id, p.id));
              else openEdit({ profileId: p.id, name: p.name, entryId: null, clockIn: null, clockOut: null });
            }}
            style={[styles.pick, { borderBottomColor: colors.border }]}
          >
            <AppText weight="bold">{p.name}</AppText>
            {!p.hasPay ? (
              <AppText size={12} color={colors.attentionText}>
                {t.noPay}
              </AppText>
            ) : null}
          </Pressable>
        ))}
      </Sheet>

      <Dialog visible={returning !== null} onClose={() => setReturning(null)}>
        <AppText weight="heavy" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {sd.returnTitle}
        </AppText>
        <AppField label={sd.returnNote} value={returnNote} onChangeText={setReturnNote} multiline error={dialogError ?? undefined} />
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setReturning(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={sd.giveBack} disabled={busy} onPress={() => void sendReturn()} />
          </View>
        </View>
      </Dialog>

      <Dialog visible={amountFor !== null} onClose={() => setAmountFor(null)}>
        <AppText weight="heavy" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {amountFor ? sd.editAmountTitle(amountFor.name) : ''}
        </AppText>
        <AppField label={sd.amountLabel} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" />
        <AppField label={sd.amountNote} value={amountNote} onChangeText={setAmountNote} error={dialogError ?? undefined} />
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setAmountFor(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={t.save} disabled={busy} onPress={() => void sendAmount()} />
          </View>
        </View>
      </Dialog>

      <Dialog visible={noShow !== null} onClose={() => setNoShow(null)}>
        <AppText weight="heavy" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {noShow ? t.noShowTitle(noShow.name) : ''}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {t.noShowBody}
        </AppText>
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setNoShow(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              label={t.rowNoShow}
              disabled={busy}
              onPress={() => {
                const r = noShow;
                setNoShow(null);
                if (r) void run(() => markNoShow(card.id, r.profileId));
              }}
            />
          </View>
        </View>
      </Dialog>
    </Card>
  );
}

function ActionLink({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8}>
      <AppText size={13} weight="heavy" color={colors.brandText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  warn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  noShowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pick: { paddingVertical: 12, borderBottomWidth: 0.5, gap: 2 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
