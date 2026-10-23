import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../AppText';
import { ListRow } from '../ListRow';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { siteLabel, type LeadSite } from '@/lib/leadRules';
import type { WalkthroughDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs } from '@/lib/walkthroughStore';
import { sample, useTheme } from '@/theme';

/** Estado de la fila: lo del teléfono manda (funciona sin internet); si no hay, lo que dice el servidor. */
export function walkthroughRowState(site: LeadSite, local: WalkthroughDoc | undefined): 'closed' | 'closing' | 'draft' | null {
  if (local) {
    if (local.closeRequested) return 'closing';
    if (local.status === 'closed') return 'closed';
    // Corrigiendo una versión cerrada (Editar) también cuenta como en curso.
    return 'draft';
  }
  return site.walkthroughDone ? 'closed' : null;
}

/**
 * Pestaña Sitios (D-217: "un walkthrough hecho debe seguir visible al volver atrás"): una fila "Walkthrough · {sitio}"
 * por cada sitio con walkthrough en este teléfono o cerrado en el servidor; abre el walkthrough (cerrado, su Resumen
 * con Ver PDF). Se vuelve a leer cada vez que la pantalla toma el foco.
 */
export function LeadWalkthroughs({ leadId, sites, visible }: { leadId: string; sites: readonly LeadSite[]; visible: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const w = useWalkthroughStrings();
  const [local, setLocal] = useState<WalkthroughDoc[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      let cancelled = false;
      void listWalkthroughs().then((all) => {
        if (!cancelled) setLocal(all.filter((d) => d.leadId === leadId));
      });
      return () => {
        cancelled = true;
      };
    }, [leadId, visible]),
  );

  if (!visible) return null;
  const rows = sites
    .map((site) => ({ site, state: walkthroughRowState(site, local.find((d) => d.siteId === site.id)) }))
    .filter((r) => r.state !== null);
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
        {w.sitesSection}
      </AppText>
      {rows.map(({ site, state }, i) => (
        <ListRow
          key={site.id}
          title={w.siteRow(siteLabel(site))}
          detail={state === 'closed' ? w.siteDone : state === 'closing' ? w.siteClosing : w.siteInProgress}
          chevron
          last={i === rows.length - 1}
          onPress={() => router.push({ pathname: '/walkthrough/new', params: { lead: leadId, site: site.id } })}
        />
      ))}
    </View>
  );
}
