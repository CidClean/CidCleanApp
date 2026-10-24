import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { FormScroll } from '@/components/FormScroll';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { KeyDateField } from '@/components/UsDateField';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  fetchAccountingJobsites,
  fetchExpenseCategories,
  fetchExpenses,
  saveExpense,
  type AccountingJobsite,
  type ExpenseCategory,
} from '@/lib/accountingApi';
import { accountingAccess, isMonthKey, parseMoney, todayKey } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Nuevo gasto o editar (D-065, D-098): control Global / Jobsite al inicio, selector de jobsite, Categoría (lista de
 * Ajustes, D-130), Fecha, Monto y Nota; Guardar vuelve a la lista (D-200).
 */
export default function ExpenseFormScreen() {
  const { id, month, jobsite: preset } = useLocalSearchParams<{ id?: string; month?: string; jobsite?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const [scope, setScope] = useState<'global' | 'jobsite'>(preset ? 'jobsite' : 'global');
  const [jobsiteId, setJobsiteId] = useState<string>(preset ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState<string | null>(todayKey());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [jobsites, setJobsites] = useState<AccountingJobsite[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<'load' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchExpenseCategories().then((r) => (r.ok ? setCategories(r.data) : setFailed('load')));
    void fetchAccountingJobsites().then((r) => r.ok && setJobsites(r.data));
    if (id && isMonthKey(month)) {
      void fetchExpenses({ from: month, to: month }).then((r) => {
        const e = r.ok ? r.data.find((x) => x.id === id) : undefined;
        if (!e) {
          setFailed('load');
          return;
        }
        setScope(e.jobsiteId ? 'jobsite' : 'global');
        setJobsiteId(e.jobsiteId ?? '');
        setCategoryId(e.categoryId);
        setDate(e.spentOn);
        setAmount(e.amount.toFixed(2));
        setNote(e.note ?? '');
      });
    }
  }, [id, month]);

  if (!acc.editExpenses) return <Redirect href="/" />;

  const parsed = parseMoney(amount);
  const errors = {
    jobsite: scope === 'jobsite' && !jobsiteId,
    category: !categoryId,
    date: !date,
    amount: parsed === null,
  };

  async function save() {
    if (busy) return;
    setShowErrors(true);
    if (errors.jobsite || errors.category || errors.date || errors.amount || parsed === null || !date) return;
    setBusy(true);
    setFailed(null);
    const r = await saveExpense({ id: id ?? null, categoryId, spentOn: date, amount: parsed, note, jobsiteId: scope === 'jobsite' ? jobsiteId : null });
    setBusy(false);
    if (!r.ok) {
      setFailed('save');
      return;
    }
    goBack();
  }

  // Una categoría desactivada se sigue mostrando en el gasto que ya la tenía.
  const options = categories
    .filter((c) => c.active || c.id === categoryId)
    .map((c) => ({ value: c.id, label: locale === 'es' ? c.labelEs : c.labelEn }));
  const jobsiteOptions = jobsites
    .filter((j) => j.status !== 'terminated' || j.id === jobsiteId)
    .map((j) => ({ value: j.id, label: `${j.name} · ${j.client}` }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={id ? a.editExpense : a.newExpense} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {failed === 'load' ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {failed === 'save' ? <AppAlert tone="error" text={a.errorSave} /> : null}
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
            <SelectField label={a.jobsite} options={[{ value: '', label: a.chooseJobsite }, ...jobsiteOptions]} value={jobsiteId} onChange={setJobsiteId} />
            {showErrors && errors.jobsite ? <AppAlert tone="error" text={a.jobsiteRequired} /> : null}
          </>
        ) : null}
        <SelectField label={a.category} options={[{ value: '', label: a.categoryRequired }, ...options]} value={categoryId} onChange={setCategoryId} />
        {showErrors && errors.category ? <AppAlert tone="error" text={a.categoryRequired} /> : null}
        <KeyDateField label={a.date} value={date} onChange={setDate} error={showErrors && errors.date ? strings.common.pickDate : null} />
        <AppField label={a.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" error={showErrors && errors.amount ? a.amountError : null} />
        <AppField label={a.note} value={note} onChangeText={setNote} maxLength={500} />
        <View style={{ marginTop: 8 }}>
          <AppButton label={a.save} onPress={() => void save()} disabled={busy} />
        </View>
      </FormScroll>
    </View>
  );
}
