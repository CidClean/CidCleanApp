import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { SelectField } from '../SelectField';
import { UsDateField } from '../UsDateField';
import { Pill } from '../contract/ContractParts';
import { useIcaStrings } from '@/i18n/ica';
import { parseMoney } from '@/lib/clientRules';
import {
  createOffer,
  fetchOfferJobsites,
  fetchOffersFor,
  fetchOfferVisits,
  hour12,
  respondOffer,
  windowEnd,
  withdrawOffer,
  type JobOffer,
  type OfferJobsite,
  type OfferVisit,
} from '@/lib/icaApi';
import { freqLetters, noon, rateText, shortDay, shortName } from '@/lib/icaRules';
import { dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

/**
 * Ofrecer trabajo a un 1099 y su lista de ofertas (D-285, opcionales desde D-292; muestra
 * surveys/ica-ofertas-aprobado.html (2)): jobsite con su franja de acceso, frecuencia y pago por día, o "Visita
 * puntual"; "Ofertas" con su ficha y, para quien no tiene acceso a la app, "Registrar respuesta".
 */
export function OffersSection(props: { profileId: string; fullName: string; hasAppAccess: boolean }) {
  const { colors, brand } = useTheme();
  const t = useIcaStrings();
  const { locale } = useSession();
  const l = locale === 'es' ? 'es' : 'en';
  const today = useMemo(() => dayKey(new Date()), []);
  const [jobsites, setJobsites] = useState<OfferJobsite[] | null>(null);
  const [jobsiteId, setJobsiteId] = useState('');
  const [oneVisit, setOneVisit] = useState(false);
  const [visits, setVisits] = useState<OfferVisit[]>([]);
  const [visitId, setVisitId] = useState('');
  const [rate, setRate] = useState('');
  const [start, setStart] = useState(formatUsDate(today));
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [answer, setAnswer] = useState<JobOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchOffersFor(props.profileId);
    if (r.ok) setOffers(r.data);
  }, [props.profileId]);
  useEffect(() => {
      void load();
      void fetchOfferJobsites().then((j) => {
        setJobsites(j);
        setJobsiteId((x) => x || j[0]?.id || '');
      });
  }, [load]);
  useEffect(() => {
    setVisitId('');
    if (!oneVisit || !jobsiteId) return setVisits([]);
    void fetchOfferVisits(jobsiteId, today).then((v) => {
      setVisits(v);
      setVisitId(v[0]?.id ?? '');
    });
  }, [oneVisit, jobsiteId, today]);

  const site = jobsites?.find((j) => j.id === jobsiteId) ?? null;
  const amount = parseMoney(rate);
  const end = site ? windowEnd(site.windowStart, site.windowMinutes) : null;
  const note = site
    ? t.offerNote(site.name, hour12(site.windowStart), hour12(end), oneVisit ? (visits.find((v) => v.id === visitId) ? shortDay(noon(visits.find((v) => v.id === visitId)!.day), l) : '') : freqLetters(site.frequency, t),
        amount ? rateText(amount) : '$—')
    : null;

  async function offer() {
    if (busy || !site) return;
    const startKey = parseUsDate(start);
    if (!amount || amount <= 0 || (oneVisit && !visitId) || (!oneVisit && (!startKey || startKey === 'invalid'))) {
      return setNotice({ tone: 'error', text: t.error });
    }
    setBusy(true);
    setNotice(null);
    const r = await createOffer({
      profileId: props.profileId, jobsiteId: site.id, visitId: oneVisit ? visitId : null, rate: amount,
      start: oneVisit ? null : (startKey as string),
    });
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    setNotice({ tone: 'success', text: t.offered });
    setRate('');
    await load();
  }

  async function record(accept: boolean | 'withdraw') {
    if (busy || !answer) return;
    setBusy(true);
    const r = accept === 'withdraw' ? await withdrawOffer(answer.id) : await respondOffer(answer.id, accept);
    setBusy(false);
    setAnswer(null);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    await load();
  }

  const first = props.fullName.trim().split(/\s+/)[0] ?? props.fullName;

  return (
    <View style={{ gap: 10, marginTop: 10 }}>
      {notice ? (
        notice.tone === 'error' ? (
          <AppAlert tone="error" text={notice.text} />
        ) : (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {notice.text}
          </AppText>
        )
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <AppText weight="bold" size={14}>
          {t.offerTitle(first)}
        </AppText>
        {jobsites && jobsites.length === 0 ? (
          <AppText size={12} color={colors.secondary}>
            {t.noJobsites}
          </AppText>
        ) : null}
        {jobsites && jobsites.length > 0 ? (
          <>
            <SelectField label={t.jobsite} options={jobsites.map((j) => ({ value: j.id, label: j.name }))} value={jobsiteId} onChange={setJobsiteId} />
            {oneVisit ? (
              visits.length > 0 ? (
                <SelectField label={t.visit} options={visits.map((v) => ({ value: v.id, label: shortDay(noon(v.day), l) }))} value={visitId} onChange={setVisitId} />
              ) : (
                <AppText size={12} color={colors.secondary}>
                  {t.noVisits}
                </AppText>
              )
            ) : (
              <UsDateField label={t.startDate} value={start} onChange={setStart} />
            )}
            <AppField label={t.ratePerDay} value={rate} onChangeText={setRate} keyboardType="decimal-pad" maxLength={10} />
            {note ? (
              <AppText size={12} color={colors.secondary}>
                {note}
              </AppText>
            ) : null}
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <AppButton label={oneVisit ? t.wholeJobsite : t.oneVisit} variant="outline" onPress={() => setOneVisit((x) => !x)} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label={t.offer} onPress={() => void offer()} disabled={busy || !site} />
              </View>
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <AppText weight="bold" size={14}>
          {t.offersTitle}
        </AppText>
        {offers.length === 0 ? (
          <AppText size={12} color={colors.secondary}>
            {t.noOffers}
          </AppText>
        ) : null}
        {offers.map((o) => (
          <View key={o.id} style={styles.row}>
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText size={14}>{shortName(o.contractor)}</AppText>
                {!props.hasAppAccess ? <Pill label={t.noAccess} tone="neutral" /> : null}
              </View>
              <AppText size={12} color={colors.secondary}>
                {o.kind === 'visit' && o.visitDate
                  ? `${o.jobsite} · ${t.oneVisitOn(shortDay(noon(o.visitDate), l))}`
                  : o.status === 'pending'
                    ? t.sentOnShort(o.jobsite, shortDay(o.offeredAt, l))
                    : `${o.jobsite} · ${shortDay(o.respondedAt ?? o.offeredAt, l)}`}
              </AppText>
            </View>
            {o.status === 'pending' ? (
              <Pressable accessibilityRole="button" onPress={() => setAnswer(o)} hitSlop={8}>
                {props.hasAppAccess ? (
                  <Pill label={t.offerStatus.pending} tone="neutral" />
                ) : (
                  <AppText size={13} weight="heavy" color={brand}>
                    {t.registerAnswer}
                  </AppText>
                )}
              </Pressable>
            ) : (
              <Pill label={t.offerStatus[o.status]} tone={o.status === 'accepted' ? 'ok' : 'neutral'} />
            )}
          </View>
        ))}
      </View>

      <Dialog visible={answer !== null} onClose={() => setAnswer(null)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {props.hasAppAccess ? t.withdraw : t.registerTitle(first)}
        </AppText>
        {!props.hasAppAccess ? (
          <>
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
              {t.registerNote}
            </AppText>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <AppButton label={t.declined} variant="outline" onPress={() => void record(false)} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label={t.accepted} onPress={() => void record(true)} disabled={busy} />
              </View>
            </View>
          </>
        ) : null}
        <AppButton label={t.withdraw} variant="text" onPress={() => void record('withdraw')} disabled={busy} />
        <AppButton label={t.cancel} variant="text" onPress={() => setAnswer(null)} />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row2: { flexDirection: 'row', gap: 8 },
});
