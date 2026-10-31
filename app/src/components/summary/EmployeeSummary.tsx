import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { Chip } from '../Chip';
import { BrandLoading } from '../brand/BrandLoading';
import { Card, CardBlock, useCardText } from '../bento/Card';
import { YearBar } from './YearBar';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { useSummaryPlStrings } from '@/i18n/useSummaryPlStrings';
import { hoursText, money } from '@/lib/accountingRules';
import { readableFileName } from '@/lib/fileName';
import { shareCsv, sharePdf } from '@/lib/sharePdf';
import {
  accountLine,
  fetchEmployeeSummary,
  monthName,
  summaryCsv,
  summaryHtml,
  summaryMonths,
  workLabel,
  type EmployeeSummary as Summary,
} from '@/lib/summaryPl';
import { sample, useTheme } from '@/theme';

/**
 * Pestaña Resumen del empleado (orden 71, D-294, `surveys/resumen-pl-pdf-aprobado.html` (1)): año con flechas, tarjeta
 * verde con días de servicio (horas si es W-2) y total pagado, "Cuentas" con todas sus cuentas (Vigente / Terminada,
 * cliente y fechas), "Por mes" con días (u horas) y monto, el total del año y "Exportar (PDF / CSV)". Solo se muestra
 * con `empleados_ver_pagos` (lo decide la pantalla del perfil; la base también lo exige).
 */
export function EmployeeSummary({ profileId }: { profileId: string }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const t = useSummaryPlStrings();
  const hero = useCardText('brand');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setFailed(false);
    const r = await fetchEmployeeSummary(profileId, year);
    setFailed(!r.ok);
    if (r.ok) setData(r.data);
  }, [profileId, year]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const result = (r: 'shared' | 'unavailable' | 'error') => setNotice(r === 'unavailable' ? a.shareUnavailable : r === 'error' ? a.shareError : null);

  async function exportPdf() {
    if (!data || busy) return;
    setBusy(true);
    result(await sharePdf(summaryHtml(data, t, a), `${t.summaryTitle} ${data.name} ${data.year}`, readableFileName(['Resumen', data.name, data.year], 'pdf')));
    setBusy(false);
  }

  async function exportCsv() {
    if (!data || busy) return;
    setBusy(true);
    result(await shareCsv(summaryCsv(data, t), readableFileName(['Resumen', data.name, data.year], 'csv'), t.summaryTitle));
    setBusy(false);
  }

  const w2 = data?.workerType === 'w2';
  const months = data ? summaryMonths(data) : [];

  return (
    <View style={styles.wrap}>
      <YearBar year={year} onChange={setYear} />
      {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
      {notice ? <AppAlert text={notice} /> : null}
      {data === null && !failed ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}

      {data ? (
        <>
          <Card tone="brand" wide style={styles.hero}>
            <View style={{ flex: 1 }}>
              <AppText size={12} color={hero.soft} style={{ opacity: hero.softOpacity }}>
                {w2 ? t.hours : t.serviceDays}
              </AppText>
              <AppText weight="heavy" size={22} color={hero.main}>
                {w2 ? `${hoursText(data.minutes)} h` : String(data.days)}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={12} color={hero.soft} style={{ opacity: hero.softOpacity }}>
                {t.paid}
              </AppText>
              <AppText weight="heavy" size={22} color={hero.main}>
                {money(data.amount)}
              </AppText>
            </View>
          </Card>

          <CardBlock>
            <AppText weight="heavy" size={15}>
              {t.accounts}
            </AppText>
            {data.accounts.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noAccounts}
              </AppText>
            ) : (
              data.accounts.map((x, i) => (
                <View key={`${x.jobsiteId}-${x.startDate}-${i}`} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <AppText size={14}>{x.jobsite}</AppText>
                    <AppText size={12} color={colors.secondary}>
                      {accountLine(x, a, t)}
                    </AppText>
                  </View>
                  <Chip label={x.current ? t.current : t.ended} tone={x.current ? 'success' : 'neutral'} />
                </View>
              ))
            )}
          </CardBlock>

          <CardBlock>
            <AppText weight="heavy" size={15}>
              {t.byMonth}
            </AppText>
            {months.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {t.noMonths}
              </AppText>
            ) : (
              months.map((m) => (
                <View key={m.month} style={styles.row}>
                  <AppText size={14}>{monthName(m.month, a)}</AppText>
                  <AppText size={14}>{`${workLabel(data, m, t)} · ${money(m.amount)}`}</AppText>
                </View>
              ))
            )}
            <View style={[styles.line, { borderTopColor: colors.border }]} />
            <View style={styles.row}>
              <AppText weight="heavy" size={14}>
                {t.total(data.year)}
              </AppText>
              <AppText weight="heavy" size={14}>
                {`${workLabel(data, data, t)} · ${money(data.amount)}`}
              </AppText>
            </View>
          </CardBlock>

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  hero: { flexDirection: 'row', gap: 8, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 4 },
  line: { borderTopWidth: 0.5, marginVertical: 4 },
  buttons: { flexDirection: 'row', gap: 8 },
});
