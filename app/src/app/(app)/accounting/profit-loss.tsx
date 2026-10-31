import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Segmented } from '@/components/Segmented';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { YearBar } from '@/components/summary/YearBar';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { useSummaryPlStrings } from '@/i18n/useSummaryPlStrings';
import { fetchExpenseCategories, type ExpenseCategory } from '@/lib/accountingApi';
import { accountingAccess, money } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { shareCsv, sharePdf } from '@/lib/sharePdf';
import { fetchProfitAndLoss, lineLabel, plCsv, plFileName, plHtml, plSummaryRows, type ProfitAndLoss } from '@/lib/summaryPl';
import { useTheme } from '@/theme';

type View2 = 'summary' | 'schedule_c';

/**
 * Profit & Loss (orden 72, D-295, `surveys/resumen-pl-pdf-aprobado.html` (2, 3)): año con flechas, vistas Resumen /
 * Schedule C, y exportar PDF (documento de D-293, "Cash basis") y CSV de la vista elegida. Permiso dashboard_global
 * (el de Accounting que ya ve los totales); exportar pide además reportes_exportar, como los otros exportes.
 */
export default function ProfitLossScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const t = useSummaryPlStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [view, setView] = useState<View2>('summary');
  const [data, setData] = useState<ProfitAndLoss | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setFailed(false);
    const [r, c] = await Promise.all([fetchProfitAndLoss(year), fetchExpenseCategories()]);
    setFailed(!r.ok);
    if (r.ok) setData(r.data);
    // D-200: todas las categorías activas si se pueden leer; si no, las que tienen gastos en el año.
    setCategories(c.ok ? c.data.filter((x) => x.active) : null);
  }, [year]);

  useFocusEffect(
    useCallback(() => {
      if (acc.global) void load();
    }, [load, acc.global]),
  );

  if (!acc.global) return <Redirect href="/" />;

  const result = (r: 'shared' | 'unavailable' | 'error') => setNotice(r === 'unavailable' ? a.shareUnavailable : r === 'error' ? a.shareError : null);

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true);
    result(await sharePdf(plHtml(data, view, t, locale), `${t.plTitle} ${data.year}`));
    setBusy(false);
  }

  async function exportCsv() {
    if (!data || busy) return;
    setBusy(true);
    result(await shareCsv(plCsv(data, view, t, locale), plFileName(data.year, view), t.plTitle));
    setBusy(false);
  }

  const row = (label: string, amount: number, bold = false, key?: string) => (
    <View key={key ?? label} style={styles.row}>
      <AppText weight={bold ? 'heavy' : 'regular'} size={14} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText weight={bold ? 'heavy' : 'regular'} size={14}>
        {money(amount)}
      </AppText>
    </View>
  );
  const line = <View style={[styles.line, { borderTopColor: colors.border }]} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={t.plTitle} />
      <ScrollView contentContainerStyle={styles.page}>
        <YearBar year={year} onChange={setYear} />
        <Segmented<View2>
          value={view}
          onChange={setView}
          options={[
            { value: 'summary', label: t.viewSummary },
            { value: 'schedule_c', label: t.viewScheduleC },
          ]}
        />

        {failed ? <AppAlert tone="error" text={t.plErrorLoad} /> : null}
        {notice ? <AppAlert text={notice} /> : null}
        {data === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}

        {data && view === 'summary' ? (
          <CardBlock>
            {row(t.income, data.income, true)}
            {line}
            {plSummaryRows(data, t, locale).map((r, i) => row(r.label, r.amount, false, `${r.label}-${i}`))}
            {line}
            {row(t.net, data.net, true)}
          </CardBlock>
        ) : null}

        {data && view === 'schedule_c' ? (
          <>
            <CardBlock>
              <AppText weight="heavy" size={15}>
                {t.scheduleCTitle(data.year)}
              </AppText>
              {data.scheduleC
                .filter((l) => l.line !== '31')
                .map((l) => row(lineLabel(l.line, l.name), l.amount, false, l.line))}
              {line}
              {row(lineLabel('31', 'Net profit'), data.net, true)}
            </CardBlock>
            <CardBlock>
              <AppText weight="heavy" size={15}>
                {t.categoryLines}
              </AppText>
              {(categories ?? data.expenses.map((e) => ({ id: e.categoryId, labelEs: e.labelEs, labelEn: e.labelEn, scheduleCLine: e.line }))).map((c) => (
                <View key={c.id} style={styles.row}>
                  <AppText size={14} style={{ flex: 1 }}>
                    {locale === 'es' ? c.labelEs : c.labelEn}
                  </AppText>
                  <AppText size={14}>{lineLabel(c.scheduleCLine)}</AppText>
                </View>
              ))}
              <AppText size={12} color={colors.secondary} style={{ lineHeight: 17 }}>
                {t.categoryLinesNote}
              </AppText>
            </CardBlock>
          </>
        ) : null}

        {data && acc.export ? (
          <>
            <AppText weight="bold" size={14}>
              {t.exportButton}
            </AppText>
            <View style={styles.buttons}>
              <View style={{ flex: 1 }}>
                <AppButton label="PDF" icon="file-text" onPress={() => void exportPdf()} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="CSV" icon="share" variant="outline" onPress={() => void exportCsv()} disabled={busy} />
              </View>
            </View>
          </>
        ) : null}

        {data && view === 'summary' ? (
          <AppText size={12} color={colors.secondary} style={{ lineHeight: 17 }}>
            {t.plNote}
          </AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 4 },
  line: { borderTopWidth: 0.5, marginVertical: 4 },
  buttons: { flexDirection: 'row', gap: 8 },
});
