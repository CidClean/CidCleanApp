import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { accountingAccess, money, monthKeyOf, monthStart, monthTitle, shiftMonth } from '@/lib/accountingRules';
import { rowDate } from '@/lib/myHours';
import { useGoBack } from '@/lib/navigation';
import { BRAND_PDF_CSS, brandFooterHtml, brandHeaderHtml } from '@/lib/pdfBrand';
import { fetchStatement, statementCsv, statementHtml, type Statement } from '@/lib/serviceDays';
import { usePermissions } from '@/lib/session';
import { shareCsv, sharePdf } from '@/lib/sharePdf';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Estado de cuenta de los 1099 (D-286 (4), `surveys/dias-servicio-aprobado.html`): mes con flechas (nunca pastillas),
 * por contratista los días aprobados, el monto y "Pagar antes del {fecha}" (cierre el último día del mes, vence 7 días
 * después); los fijos mensuales aparte. Exportar PDF y CSV como los demás exportes (D-215).
 */
export default function StatementScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const t = useServiceDaysStrings();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [data, setData] = useState<Statement | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setFailed(false);
    const r = await fetchStatement(monthStart(month));
    setFailed(!r.ok);
    if (r.ok) setData(r.data);
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!acc.staff) return <Redirect href="/" />;

  const due = data ? rowDate(data.dueOn, strings) : '';
  const result = (r: 'shared' | 'unavailable' | 'error') => setNotice(r === 'unavailable' ? a.shareUnavailable : r === 'error' ? a.shareError : null);

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true);
    const html = statementHtml(
      data,
      { title: t.statementTitle, monthTitle: monthTitle(month, a), payBefore: t.payBefore(due), note: t.statementNote, header: t.csvHeader },
      { css: BRAND_PDF_CSS, header: brandHeaderHtml(), footer: brandFooterHtml() },
      money,
    );
    result(await sharePdf(html, `${t.statementTitle} ${monthTitle(month, a)}`));
    setBusy(false);
  }

  async function exportCsv() {
    if (!data || busy) return;
    setBusy(true);
    result(await shareCsv(statementCsv(data, t.csvHeader), `estado-de-cuenta-${month}.csv`, t.statementTitle));
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={t.statementTitle} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.bar, { backgroundColor: colors.card }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={strings.myHours.previousMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.arrow}>
            <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
          <AppText weight="heavy" size={15} center style={{ flex: 1 }} accessibilityRole="header">
            {monthTitle(month, a)}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={strings.myHours.nextMonth} hitSlop={8} onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.arrow}>
            <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
          </Pressable>
        </View>

        {failed ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {notice ? <AppAlert text={notice} /> : null}
        {data === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}

        {data ? (
          data.rows.length === 0 ? (
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.statementEmpty}
            </AppText>
          ) : (
            <CardBlock>
              {data.rows.map((r, i) => {
                const fixedOnly = r.fixedAmount > 0 && r.daysAmount === 0;
                const line = fixedOnly
                  ? t.fixedMonthly(r.days)
                  : r.edited > 0
                    ? `${t.daysApproved(r.days)} · ${t.daysEdited(r.edited)}`
                    : t.daysApproved(r.days);
                return (
                  <View key={r.profileId} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: i === data.rows.length - 1 ? 0 : 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" size={14}>
                        {r.name}
                      </AppText>
                      <AppText size={12} color={colors.secondary}>
                        {line}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText weight="heavy" size={14}>
                        {money(r.amount)}
                      </AppText>
                      <AppText size={12} color={fixedOnly ? colors.secondary : colors.brandText}>
                        {fixedOnly ? t.monthly : t.payBefore(due)}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </CardBlock>
          )
        ) : null}

        {data && data.rows.length > 0 && acc.export ? (
          <AppText weight="bold" size={14}>
            {t.exportButton}
          </AppText>
        ) : null}
        {data && data.rows.length > 0 && acc.export ? (
          <View style={styles.buttons}>
            <View style={{ flex: 1 }}>
              <AppButton label="PDF" icon="file-text" onPress={() => void exportPdf()} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton label="CSV" icon="share" variant="outline" onPress={() => void exportCsv()} disabled={busy} />
            </View>
          </View>
        ) : null}

        <AppText size={12} color={colors.secondary} style={{ lineHeight: 17 }}>
          {t.statementNote}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  bar: { height: 48, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 11 },
  buttons: { flexDirection: 'row', gap: 8 },
});
