import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { UsDateField } from '@/components/UsDateField';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canAssign, startDateError } from '@/lib/clientRules';
import { assignEmployee, fetchAssignableEmployees, fetchAssignableJobsites, fetchLegacyJobsiteIds, type Option } from '@/lib/clientsApi';
import { dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Asignar personal (D-210): desde Personal del jobsite se elige el empleado; desde Pagos del empleado, el jobsite.
 * Fecha de inicio (desde hoy). El supervisor asigna sin ver cifras; el pago se define después en su fila (D-200).
 */
export default function AssignScreen() {
  const params = useLocalSearchParams<{ jobsite?: string; profile?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const today = useMemo(() => new Date(), []);
  const byJobsite = Boolean(params.jobsite);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [choice, setChoice] = useState('');
  const [start, setStart] = useState(formatUsDate(dayKey(today)));
  const [error, setError] = useState<'start' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);
  // D-241: en jobsites de clientes previos la fecha de inicio puede ser pasada.
  const [legacyIds, setLegacyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void fetchLegacyJobsiteIds().then((r) => r.ok && setLegacyIds(r.data));
  }, []);
  // D-244: el Super Admin puede poner una fecha pasada en cualquier jobsite.
  const legacy = access.isSuperAdmin || legacyIds.has(byJobsite ? (params.jobsite as string) : choice);

  useEffect(() => {
    let cancelled = false;
    void (byJobsite ? fetchAssignableEmployees() : fetchAssignableJobsites()).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setError('save');
        return;
      }
      setOptions(r.data);
      setChoice((prev) => prev || (r.data[0]?.id ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [byJobsite]);

  if (!canAssign(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving || !choice) return;
    const key = parseUsDate(start);
    if (!key || key === 'invalid' || startDateError(key, today, legacy)) {
      setError('start');
      return;
    }
    setSaving(true);
    setError(null);
    const r = byJobsite
      ? await assignEmployee(params.jobsite as string, choice, key)
      : await assignEmployee(choice, params.profile as string, key);
    setSaving(false);
    if (!r.ok) {
      setError('save');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={byJobsite ? c.assign.title : c.assign.titleJobsite} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {options && options.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
            {byJobsite ? c.assign.noEmployees : c.assign.noJobsites}
          </AppText>
        ) : null}
        {options && options.length > 0 ? (
          <SelectField
            label={byJobsite ? c.assign.employee : c.assign.jobsite}
            options={options.map((o) => ({ value: o.id, label: o.label }))}
            value={choice}
            onChange={setChoice}
          />
        ) : null}
        <UsDateField
          label={c.assign.start}
          value={start}
          onChange={(v) => {
            setStart(v);
            setError(null);
          }}
          error={error === 'start' ? c.assign.errorStart : null}
          allowPast={legacy}
        />
        {error === 'save' ? <AppAlert tone="error" text={c.assign.errorSave} /> : null}
        <AppButton label={c.assign.submit} onPress={() => void submit()} disabled={saving || !choice} />
      </ScrollView>
    </View>
  );
}
