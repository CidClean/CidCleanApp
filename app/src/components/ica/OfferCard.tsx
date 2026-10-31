import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppText } from '../AppText';
import { Card } from '../bento/Card';
import { WhiteButton } from '../work/ServiceDayCard';
import { showDone } from '@/components/brand/DoneOverlay';
import { useIcaStrings } from '@/i18n/ica';
import { fetchMyOffers, hour12, respondOffer, type JobOffer } from '@/lib/icaApi';
import { freqCount, noon, rateText, shortDay } from '@/lib/icaRules';
import { useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Oferta de trabajo del lado del 1099 (D-285, muestra surveys/ica-ofertas-aprobado.html (3)): tarjeta verde "Nueva
 * oferta de trabajo" con el sitio, la franja de acceso del cliente, la frecuencia y el pago por día de servicio, y
 * "Rechazar" · "Aceptar"; debajo, "Puedes aceptar o rechazar sin ninguna consecuencia." Una tarjeta por oferta pendiente.
 */
export function OfferCards({ onChanged }: { onChanged?: () => void }) {
  const { colors } = useTheme();
  const t = useIcaStrings();
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchMyOffers();
    if (r.ok) setOffers(r.data.filter((o) => o.status === 'pending'));
  }, []);
  useEffect(() => {
      void load();
  }, [load]);

  async function answer(o: JobOffer, accept: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await respondOffer(o.id, accept);
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    if (accept) showDone();
    setNotice({ tone: 'ok', text: accept ? t.acceptedDone : t.declinedDone });
    await load();
    onChanged?.();
  }

  if (offers.length === 0 && !notice) return null;
  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {notice ? (
        notice.tone === 'error' ? (
          <AppAlert tone="error" text={notice.text} />
        ) : (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {notice.text}
          </AppText>
        )
      ) : null}
      {offers.map((o) => (
        <OfferHero key={o.id} offer={o} busy={busy} onAnswer={(a) => void answer(o, a)} />
      ))}
      {offers.length > 0 ? (
        <AppText size={12} color={colors.secondary}>
          {t.noConsequence}
        </AppText>
      ) : null}
    </View>
  );
}

function OfferHero({ offer: o, busy, onAnswer }: { offer: JobOffer; busy: boolean; onAnswer: (accept: boolean) => void }) {
  const t = useIcaStrings();
  const { locale } = useSession();
  const freq = o.kind === 'visit' && o.visitDate ? t.onDay(shortDay(noon(o.visitDate), locale === 'es' ? 'es' : 'en')) : freqCount(o.frequency, t);
  return (
    <Card tone="brand" wide style={styles.card}>
      <View style={{ gap: 6 }}>
        <AppText weight="heavy" size={17} color="#FFFFFF">
          {t.newOffer}
        </AppText>
        <AppText size={12} color="#FFFFFF" style={{ opacity: 0.85 }}>
          {t.offerDetail(o.jobsite, hour12(o.windowStart), hour12(o.windowEnd), freq, rateText(o.rate))}
        </AppText>
        {o.note ? (
          <AppText size={12} color="#FFFFFF" style={{ opacity: 0.85 }}>
            {o.note}
          </AppText>
        ) : null}
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <OutlineWhite label={t.decline} onPress={() => onAnswer(false)} disabled={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <WhiteButton label={t.accept} onPress={() => onAnswer(true)} disabled={busy} />
        </View>
      </View>
    </Card>
  );
}

/** Botón con borde blanco sobre la tarjeta de marca (muestra D-292: `.btnw2`). */
function OutlineWhite({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.outline, { opacity: disabled ? 0.6 : 1 }]}
    >
      <AppText weight="heavy" size={15} color="#FFFFFF">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  row2: { flexDirection: 'row', gap: 8 },
  outline: { borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
});
