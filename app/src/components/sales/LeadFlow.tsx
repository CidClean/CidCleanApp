import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { DialogButtons } from '../work/SimpleParts';
import type { SalesStrings } from '@/i18n/sales';
import { useStrings } from '@/i18n/useStrings';
import { isColdStatus, leadTone, writeStep, type LeadStatus } from '@/lib/leadRules';
import { decideNoResponse, markLeadResponded } from '@/lib/leadsApi';
import { sample, status as statusColors, useTheme } from '@/theme';

/** Lo que se confirma en la propia pantalla (D-333): Respondió, Marcar perdido (Sin respuesta) o Reintentar. */
export type FlowAsk = { kind: 'responded' | 'lost' | 'retry'; id: string; company: string };

/** Ficha del estado con el color del survey flujo-leads-aprobado (ámbar toca, rojo Sin respuesta, marca, neutro). */
export function LeadStatusChip({ status, s }: { status: LeadStatus; s: SalesStrings }) {
  const { colors } = useTheme();
  const tone = leadTone(status);
  const bg =
    tone === 'attention' ? colors.attention : tone === 'alert' ? `${statusColors.error}22` : tone === 'brand' || tone === 'won' ? colors.brandSoft : colors.surface;
  const fg =
    tone === 'attention' ? colors.attentionText : tone === 'alert' ? statusColors.error : tone === 'brand' || tone === 'won' ? colors.brandText : colors.secondary;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <AppText size={11} weight="heavy" color={fg}>
        {s.status[status]}
      </AppText>
    </View>
  );
}

/** Botón chico de la fila (survey: `.ab`): de marca o con borde de marca. */
export function SmallButton({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  const { brand, colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={4}
      style={[styles.small, primary ? { backgroundColor: brand } : { borderWidth: 1, borderColor: brand }]}
    >
      <AppText size={12} weight="heavy" color={primary ? '#FFFFFF' : colors.brandText}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Abre "Enviar correo" del lead con la plantilla de su paso ya elegida (D-333 (6)); sin paso, la lista de plantillas. */
export function useWriteToLead() {
  const router = useRouter();
  return (id: string, status: LeadStatus) => {
    const step = writeStep(status);
    router.push({ pathname: '/send-email', params: step ? { kind: 'lead', id, step } : { kind: 'lead', id } });
  };
}

/**
 * Botones de un lead en frío: "Escribir" y "Respondió"; en Sin respuesta, "Reintentar" y "Marcar perdido (Sin
 * respuesta)" (D-333 (1)). Respondió y las decisiones piden `leads_editar`.
 */
export function LeadFlowButtons({
  id,
  company,
  status,
  canEdit,
  s,
  onAsk,
}: {
  id: string;
  company: string;
  status: LeadStatus;
  canEdit: boolean;
  s: SalesStrings;
  onAsk: (ask: FlowAsk) => void;
}) {
  const write = useWriteToLead();
  if (!isColdStatus(status)) return null;
  if (status === 'no_response') {
    if (!canEdit) return null;
    return (
      <View style={styles.row}>
        <SmallButton label={s.flow.retry} primary onPress={() => onAsk({ kind: 'retry', id, company })} />
        <SmallButton label={s.flow.markLost} onPress={() => onAsk({ kind: 'lost', id, company })} />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <SmallButton label={s.flow.write} primary onPress={() => write(id, status)} />
      {canEdit ? <SmallButton label={s.flow.responded} onPress={() => onAsk({ kind: 'responded', id, company })} /> : null}
    </View>
  );
}

/** Ventana de confirmación en la propia pantalla (Dialog de la app, sin Alert nativo). */
export function LeadFlowDialog({ ask, s, onClose, onDone }: { ask: FlowAsk | null; s: SalesStrings; onClose: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const title =
    ask?.kind === 'responded' ? s.flow.respondedTitle(ask.company) : ask?.kind === 'lost' ? s.flow.lostTitle(ask.company) : ask ? s.flow.retryTitle(ask.company) : '';
  const body = ask?.kind === 'responded' ? s.flow.respondedBody : ask?.kind === 'lost' ? s.flow.lostBody : s.flow.retryBody;
  const yes = ask?.kind === 'responded' ? s.flow.respondedYes : ask?.kind === 'lost' ? s.flow.markLost : s.flow.retry;

  async function confirm() {
    if (!ask || busy) return;
    setBusy(true);
    setFailed(false);
    const r = ask.kind === 'responded' ? await markLeadResponded(ask.id) : await decideNoResponse(ask.id, ask.kind);
    setBusy(false);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    onDone();
  }

  return (
    <Dialog
      visible={ask !== null}
      onClose={() => {
        setFailed(false);
        onClose();
      }}
    >
      <AppText weight="heavy" size={sample.headingSize}>
        {title}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 4, marginBottom: 12 }}>
        {body}
      </AppText>
      {failed ? <AppAlert tone="error" text={s.flow.errorAction} /> : null}
      <DialogButtons
        cancel={strings.common.cancel}
        save={yes}
        onCancel={() => {
          setFailed(false);
          onClose();
        }}
        onSave={() => void confirm()}
        disabled={busy}
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  small: { borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
