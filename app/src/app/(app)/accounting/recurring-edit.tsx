import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { FormScroll } from '@/components/FormScroll';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { Switch } from '@/components/Switch';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  fetchAccountingJobsites,
  fetchExpenseCategories,
  fetchRecurring,
  saveRecurring,
  type AccountingJobsite,
  type ExpenseCategory,
} from '@/lib/accountingApi';
import { accountingAccess, parseMoney, type RecurringFrequency } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Gasto recurrente (D-103, D-215): Nombre, Categoría, Global / Jobsite, Monto, frecuencia Cada mes o Cada año,
 * "Se genera el día" (y el mes si es anual), interruptor Activo y Guardar.
 */
export default function RecurringFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scope, setScope] = useState<'global' | 'jobsite'>('global');
  const [jobsiteId, setJobsiteId] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [day, setDay] = useState('1');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [active, setActive] = useState(true);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [jobsites, setJobsites] = useState<AccountingJobsite[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<'load' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchExpenseCategories().then((r) => (r.ok ? setCategories(r.data) : setFailed('load')));
    void fetchAccountingJobsites().then((r) => r.ok && setJobsites(r.data));
    if (id) {
      void fetchRecurring().then((r) => {
        const x = r.ok ? r.data.find((y) => y.id === id) : undefined;
        if (!x) {
          setFailed('load');
          return;
        }
        setName(x.name);
        setCategoryId(x.categoryId);
        setScope(x.jobsiteId ? 'jobsite' : 'global');
        setJobsiteId(x.jobsiteId ?? '');
        setAmount(x.amount.toFixed(2));
        setFrequency(x.frequency);
        setDay(String(x.day));
        if (x.month) setMonth(String(x.month));
        setActive(x.active);
      });
    }
  }, [id]);

  if (!acc.recurring) return <Redirect href="/" />;

  const parsed = parseMoney(amount);
  const errors = { name: name.trim() === '', category: !categoryId, jobsite: scope === 'jobsite' && !jobsiteId, amount: parsed === null };

  async function save() {
    if (busy) return;
    setShowErrors(true);
    if (errors.name || errors.category || errors.jobsite || errors.amount || parsed === null) return;
    setBusy(true);
    setFailed(null);
    const r = await saveRecurring({
      id: id ?? null,
      name: name.trim(),
      categoryId,
      jobsiteId: scope === 'jobsite' ? jobsiteId : null,
      amount: parsed,
      frequency,
      day: Number(day),
      month: frequency === 'yearly' ? Number(month) : null,
      active,
    });
    setBusy(false);
    if (!r.ok) {
      setFailed('save');
      return;
    }
    goBack();
  }

  const days = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const months = a.months.map((m, i) => ({ value: String(i + 1), label: m[0].toUpperCase() + m.slice(1) }));
  const options = categories.filter((c) => c.active || c.id === categoryId).map((c) => ({ value: c.id, label: locale === 'es' ? c.labelEs : c.labelEn }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={id ? a.editRecurring : a.newRecurring} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {failed === 'load' ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {failed === 'save' ? <AppAlert tone="error" text={a.errorSave} /> : null}
        <AppField label={a.name} value={name} onChangeText={setName} maxLength={120} error={showErrors && errors.name ? a.nameRequired : null} />
        <SelectField label={a.category} options={[{ value: '', label: a.categoryRequired }, ...options]} value={categoryId} onChange={setCategoryId} />
        {showErrors && errors.category ? <AppAlert tone="error" text={a.categoryRequired} /> : null}
        <Segmented
          options={[
            { value: 'global', label: a.globalExpense },
            { value: 'jobsite', label: a.jobsite },
          ]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'jobsite' ? (
          <>
            <SelectField
              label={a.jobsite}
              options={[{ value: '', label: a.chooseJobsite }, ...jobsites.filter((j) => j.status !== 'terminated' || j.id === jobsiteId).map((j) => ({ value: j.id, label: `${j.name} · ${j.client}` }))]}
              value={jobsiteId}
              onChange={setJobsiteId}
            />
            {showErrors && errors.jobsite ? <AppAlert tone="error" text={a.jobsiteRequired} /> : null}
          </>
        ) : null}
        <AppField label={a.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" error={showErrors && errors.amount ? a.amountError : null} />
        <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
          {a.frequency}
        </AppText>
        <Segmented
          options={[
            { value: 'monthly', label: a.monthly },
            { value: 'yearly', label: a.yearly },
          ]}
          value={frequency}
          onChange={setFrequency}
        />
        <View style={styles.two}>
          <View style={{ flex: 1 }}>
            <SelectField label={a.generatedOnDay} options={days} value={day} onChange={setDay} />
          </View>
          {frequency === 'yearly' ? (
            <View style={{ flex: 1 }}>
              <SelectField label={a.inMonth} options={months} value={month} onChange={setMonth} />
            </View>
          ) : null}
        </View>
        <View style={styles.switchRow}>
          <AppText>{a.active}</AppText>
          <Switch value={active} onChange={setActive} accessibilityLabel={a.active} />
        </View>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {a.recurringNote}
        </AppText>
        <AppButton label={a.save} onPress={() => void save()} disabled={busy} />
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  two: { flexDirection: 'row', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
});
