import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { CardBlock } from '@/components/bento/Card';
import type { SalesStrings } from '@/i18n/sales';
import { formatDateTime } from '@/lib/leadRules';
import { fetchSiteRequests, type SiteRequest } from '@/lib/leadsApi';
import { sample, useTheme } from '@/theme';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Línea gris de una solicitud: tipo · sq ft · frecuencia · ciudad · rango, o el mensaje (orden 101). */
export function siteRequestDetail(r: SiteRequest, s: SalesStrings): string {
  const city = r.city ? (r.zip ? `${r.city} ${r.zip}` : r.city) : null;
  if (r.kind === 'contact') return [city, r.message].filter(Boolean).join(' · ');
  const parts = [
    r.typeName,
    r.sqft !== null ? s.siteRequests.size(r.sqft.toLocaleString('en-US')) : null,
    r.frequencyName,
    city,
    r.rangeLow !== null && r.rangeHigh !== null ? s.siteRequests.range(money(r.rangeLow), money(r.rangeHigh)) : null,
  ];
  const line = parts.filter(Boolean).join(' · ');
  return r.customerMail ? line : `${line}\n${s.siteRequests.noCustomerMail}`;
}

/**
 * Bloque "Solicitudes del sitio" en Notas del lead (orden 101, N2; D-200): los envíos del sitio que llegaron con el
 * correo de este lead cuando ya estaba abierto. No entran en las notas y van marcados como sin verificar.
 * Si no hay ninguna, no se muestra nada.
 */
export function SiteRequests({ leadId, s }: { leadId: string; s: SalesStrings }) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<SiteRequest[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSiteRequests(leadId).then((r) => {
      if (cancelled) return;
      if (r.ok) setRows(r.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (failed) return <AppAlert tone="error" text={s.siteRequests.errorLoad} />;
  if (!rows || rows.length === 0) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AppText weight="medium">{s.siteRequests.title}</AppText>
        <Chip label={s.siteRequests.unverified} tone="warning" />
      </View>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
        {s.siteRequests.unverifiedNote}
      </AppText>
      <CardBlock>
        {rows.map((r, i) => (
          <ListRow
            key={r.id}
            title={`${formatDateTime(r.createdAt, s)} · ${r.kind === 'contact' ? s.siteRequests.contact : s.siteRequests.estimate}`}
            detail={siteRequestDetail(r, s)}
            last={i === rows.length - 1}
          />
        ))}
      </CardBlock>
    </View>
  );
}
