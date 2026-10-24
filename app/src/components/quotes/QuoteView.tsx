import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import type { PortalStrings } from '@/i18n/quotes';
import { discountAmount, frequencyText, money, shortDate, type Frequency } from '@/lib/quoteRules';
import { radius, sample, useTheme } from '@/theme';

export type QuoteViewData = {
  company: string;
  site: string;
  address: string;
  frequency: Frequency | null;
  lines: {
    services: { label: string; amount: number | null }[];
    addons: { label: string; amount: number | null }[];
    discounts: { label: string; kind: 'amount' | 'percent'; value: number | null }[];
  };
  taxRate: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Vencimiento; null en la vista previa de un borrador (se calcula al enviar). */
  expiresAt: string | null;
  validDays: number;
  /** Quote de extra (D-238): total de una vez y fecha del servicio (AAAA-MM-DD) en vez de cuota mensual. */
  extra?: { serviceDate: string | null };
};

/**
 * Lo que ve el cliente (muestra ronda 4, D-043): cuota mensual de 26px arriba, vigencia debajo, la frecuencia y el
 * desglose (renglones, Subtotal, Tax y Total mensual). Lo usan el portal y la vista previa de la app.
 */
export function QuoteView({ data, t, language }: { data: QuoteViewData; t: PortalStrings; language: 'es' | 'en' }) {
  const { colors } = useTheme();
  const fee = data.subtotal - data.discount;
  const valid = data.expiresAt
    ? t.validUntil(shortDate(data.expiresAt, language))
    : t.validUntil(shortDate(new Date(Date.now() + data.validDays * 86400000).toISOString(), language));
  const Row = ({ label, value, last = false, strong = false }: { label: string; value: string; last?: boolean; strong?: boolean }) => (
    <View style={[styles.ln, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }]}>
      <AppText size={14} style={{ flex: 1 }} weight={strong ? 'medium' : 'regular'}>
        {label}
      </AppText>
      <AppText size={14} weight="medium">
        {value}
      </AppText>
    </View>
  );
  const Section = ({ title, rows }: { title: string; rows: { label: string; value: string }[] }) =>
    rows.length === 0 ? null : (
      <View style={{ marginBottom: 6 }}>
        <AppText size={sample.labelSize} color={colors.secondary} style={{ marginTop: 6 }}>
          {title}
        </AppText>
        {rows.map((r, i) => (
          <Row key={i} label={r.label} value={r.value} />
        ))}
      </View>
    );
  // D-223: el quote va sobre una tarjeta blanca de 24px (app y portal).
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 16 }}>
      <AppText weight="medium" size={sample.headingSize}>
        {data.company}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
        {data.site === data.address ? data.site : `${data.site} · ${data.address}`}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary}>
        {data.extra ? t.extraFee : t.monthly}
      </AppText>
      <AppText weight="medium" size={sample.titleSize} style={{ lineHeight: 31 }}>
        {money(fee)}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 6 }}>
        {valid}
      </AppText>
      {data.extra?.serviceDate ? (
        <AppText size={sample.noteSize} style={{ marginBottom: 10 }}>
          {t.serviceDate(shortDate(`${data.extra.serviceDate}T12:00:00`, language))}
        </AppText>
      ) : null}
      {!data.extra && data.frequency ? (
        <AppText size={sample.noteSize} style={{ marginBottom: 10 }}>
          {frequencyText(data.frequency, language)}
        </AppText>
      ) : null}
      <Section title={t.services} rows={data.lines.services.map((l) => ({ label: l.label, value: money(l.amount ?? 0) }))} />
      <Section title={t.addons} rows={data.lines.addons.map((l) => ({ label: l.label, value: money(l.amount ?? 0) }))} />
      <Section
        title={t.discounts}
        rows={data.lines.discounts.map((d) => ({
          label: d.kind === 'percent' ? `${d.label} (${d.value ?? 0}%)` : d.label,
          value: '−' + money(discountAmount({ ...d, value: d.value ?? 0 }, data.subtotal)),
        }))}
      />
      <View style={{ marginTop: 6 }}>
        <Row label={t.subtotal} value={money(data.subtotal)} />
        {data.discount > 0 ? <Row label={t.discounts} value={'−' + money(data.discount)} /> : null}
        <Row label={t.tax(String(data.taxRate))} value={money(data.tax)} />
        <Row label={data.extra ? t.totalOnce : t.total} value={money(data.total)} last strong />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Muestra ronda 4 `.ln`: renglón de 14px con relleno de 8px y línea fina.
  ln: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
});
