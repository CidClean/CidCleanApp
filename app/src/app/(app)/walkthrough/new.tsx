import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { siteLabel, type Lead, type LeadSite } from '@/lib/leadRules';
import { fetchLead } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { fetchServerWalkthrough } from '@/lib/walkthroughApi';
import { canDoWalkthroughs, dataFromServer, emptyData, newDoc } from '@/lib/walkthroughRules';
import { findWalkthroughForSite, saveWalkthrough } from '@/lib/walkthroughStore';
import { useTheme } from '@/theme';

/**
 * Iniciar el walkthrough de un sitio (desde la pestaña Sitios del lead). Como al agendar (D-078): campo Sitio y
 * Continuar; si se entra con el sitio ya elegido, abre directo. Abre el que ya está en este teléfono, retoma el
 * borrador del servidor o crea uno nuevo con los datos del sitio y del lead (D-200).
 */
export default function StartWalkthroughScreen() {
  const params = useLocalSearchParams<{ lead: string; site?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const [lead, setLead] = useState<Lead | null>(null);
  const [siteId, setSiteId] = useState(params.site ?? '');
  const [error, setError] = useState<'closed' | 'start' | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(l: Lead, site: LeadSite) {
    setBusy(true);
    setError(null);
    try {
      const local = await findWalkthroughForSite(site.id);
      if (local) {
        router.replace({ pathname: '/walkthrough/[id]', params: { id: local.id } });
        return;
      }
      const prefill = { address: site.address, contactName: l.contactName ?? '', phone: l.phone ?? '', email: l.email ?? '' };
      const base = {
        siteId: site.id,
        leadId: l.id,
        appointmentId: site.scheduled?.id ?? null,
        company: l.company,
        siteLabel: siteLabel(site),
        contact: prefill,
      };
      const server = await fetchServerWalkthrough(site.id);
      if (server.ok && server.data?.status === 'closed') {
        setError('closed');
        return;
      }
      const doc =
        server.ok && server.data
          ? // Borrador empezado en otro teléfono: se retoma tal cual, sin nada pendiente.
            { ...newDoc({ ...base, id: server.data.id }), data: dataFromServer(server.data.draft, emptyData(prefill)), rev: 0, everSynced: true }
          : newDoc(base);
      await saveWalkthrough(doc);
      router.replace({ pathname: '/walkthrough/[id]', params: { id: doc.id } });
    } catch {
      setError('start');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchLead(params.lead).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError('start');
        return;
      }
      setLead(result.data);
      const chosen = result.data.sites.find((s) => s.id === params.site);
      if (chosen) void open(result.data, chosen);
      else setSiteId((prev) => prev || (result.data.sites[0]?.id ?? ''));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.lead, params.site]);

  if (!canDoWalkthroughs(access)) return <Redirect href="/" />;

  const site = lead?.sites.find((s) => s.id === siteId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={w.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {error ? <AppAlert tone="error" text={error === 'closed' ? w.closedAlready : w.errorStart} /> : null}
        {lead && !params.site && lead.sites.length > 0 ? (
          <>
            <SelectField
              label={w.startSite}
              options={lead.sites.map((s) => ({ value: s.id, label: siteLabel(s) }))}
              value={siteId}
              onChange={setSiteId}
            />
            <View style={{ height: 4 }} />
            <AppButton label={w.startContinue} onPress={() => site && void open(lead, site)} disabled={busy || !site} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
