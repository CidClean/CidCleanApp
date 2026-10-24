import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchDashboard, fetchReport } from '@/lib/accountingApi';
import { accountingAccess, canExport, dashboardHtml, periodTitle, reportCsv, reportFileName, type ReportKind } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { shareCsv, sharePdf } from '@/lib/sharePdf';
import { sample, useTheme } from '@/theme';

const KINDS: ReportKind[] = ['profit', 'staff', 'expenses', 'income'];

/**
 * Exportar (D-215): por mes o rango, CSV de profit, costo de personal por empleado, gastos por categoría e ingresos
 * recibidos y pendientes (cada uno con su permiso), con el botón Compartir del teléfono (expo-sharing), y el PDF del
 * dashboard global (lib/sharePdf).
 */
export default function ExportScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const { period, setPeriod } = usePeriod();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!acc.export) return <Redirect href="/" />;

  const label: Record<ReportKind, string> = {
    profit: a.reportProfit,
    staff: a.reportStaff,
    expenses: a.reportExpenses,
    income: a.reportIncome,
  };

  function report(r: 'shared' | 'unavailable' | 'error') {
    setNotice(r === 'unavailable' ? a.shareUnavailable : r === 'error' ? a.shareError : null);
  }

  async function csv(kind: ReportKind) {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    const r = await fetchReport(kind, period);
    if (!r.ok) {
      setBusy(null);
      setNotice(a.shareError);
      return;
    }
    report(await shareCsv(reportCsv(kind, r.data, a, locale), reportFileName(kind, period), label[kind]));
    setBusy(null);
  }

  async function pdf() {
    if (busy) return;
    setBusy('pdf');
    setNotice(null);
    const r = await fetchDashboard(period, null);
    if (!r.ok) {
      setBusy(null);
      setNotice(a.shareError);
      return;
    }
    report(await sharePdf(dashboardHtml(r.data, period, a.global, a), a.pdfTitle(periodTitle(period, a))));
    setBusy(null);
  }

  const kinds = KINDS.filter((k) => canExport(acc, k));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={a.exportTitle} />
      <ScrollView contentContainerStyle={styles.page}>
        <PeriodBar period={period} onChange={setPeriod} />
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
          {a.exportNote}
        </AppText>
        {notice ? <AppAlert text={notice} /> : null}
        <CardBlock style={{ paddingVertical: 12, gap: 12 }}>
          {kinds.map((k) => (
            <View key={k} style={styles.row}>
              <AppText weight="medium" style={{ flex: 1 }}>
                {label[k]}
              </AppText>
              <View style={{ width: 150 }}>
                <AppButton label={a.shareCsv} variant="outline" icon="share" onPress={() => void csv(k)} disabled={busy !== null} />
              </View>
            </View>
          ))}
          {acc.global ? <AppButton label={a.sharePdf} icon="file-text" onPress={() => void pdf()} disabled={busy !== null} /> : null}
        </CardBlock>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
