import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ListRow } from '../ListRow';
import { CardBlock } from '@/components/bento/Card';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { siteLabel, type LeadSite } from '@/lib/leadRules';
import type { WalkthroughDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs } from '@/lib/walkthroughStore';

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
 * Lista de la pestaña Walkthrough del lead (D-220; D-217: "un walkthrough hecho debe seguir visible al volver atrás"):
 * una fila "Walkthrough · {sitio}" por sitio. Con walkthrough en este teléfono o cerrado en el servidor dice En curso,
 * Cierre pendiente de enviar o Walkthrough hecho y abre el walkthrough (cerrado, su Resumen con Ver PDF); sin él dice
 * la cita agendada y abre el calendario. Se vuelve a leer cada vez que la pantalla toma el foco.
 */
export function LeadWalkthroughs({
  leadId,
  sites,
  canOpen,
  scheduleLine,
  onSchedule,
}: {
  leadId: string;
  sites: readonly LeadSite[];
  canOpen: boolean;
  scheduleLine: (site: LeadSite) => string;
  onSchedule?: (siteId: string) => void;
}) {
  const router = useRouter();
  const w = useWalkthroughStrings();
  const [local, setLocal] = useState<WalkthroughDoc[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!canOpen) return;
      let cancelled = false;
      void listWalkthroughs().then((all) => {
        if (!cancelled) setLocal(all.filter((d) => d.leadId === leadId));
      });
      return () => {
        cancelled = true;
      };
    }, [leadId, canOpen]),
  );

  if (sites.length === 0) return null;
  return (
    <CardBlock style={{ marginBottom: 0 }}>
      {sites.map((site, i) => {
        const state = walkthroughRowState(site, canOpen ? local.find((d) => d.siteId === site.id) : undefined);
        const opens = state !== null && canOpen;
        const press = opens
          ? () => router.push({ pathname: '/walkthrough/new', params: { lead: leadId, site: site.id } })
          : state === null && onSchedule
            ? () => onSchedule(site.id)
            : undefined;
        return (
          <ListRow
            key={site.id}
            title={w.siteRow(siteLabel(site))}
            detail={state === 'closed' ? w.siteDone : state === 'closing' ? w.siteClosing : state === 'draft' ? w.siteInProgress : scheduleLine(site)}
            chevron={Boolean(press)}
            last={i === sites.length - 1}
            onPress={press}
          />
        );
      })}
    </CardBlock>
  );
}
