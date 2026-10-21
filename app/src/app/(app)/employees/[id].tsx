import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import { DataRow } from '@/components/DataRow';
import { ListRow } from '@/components/ListRow';
import { PendingBody } from '@/components/PendingScreen';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { Tabs } from '@/components/Tabs';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import type { Strings } from '@/i18n/es';
import { chooseFile, fetchDocuments, openDocument, takePhoto, uploadDocument, type PickResult } from '@/lib/documents';
import { roleLabel, subtitle, typeLabel } from '@/lib/employeeLabels';
import {
  accessState,
  canEditEmployee,
  canResendInvitation,
  canToggleActive,
  documentRows,
  editChanged,
  editFormFrom,
  formatDate,
  showsDocuments,
  validateEdit,
  type DocumentKind,
  type EditForm,
  type Employee,
  type EmployeeDocument,
} from '@/lib/employeeRules';
import { fetchEmployee, resendInvitation, setEmployeeActive, updateEmployee } from '@/lib/employeesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

type Tab = 'data' | 'permissions' | 'pay';
type ConfirmSheet = 'deactivate' | 'reactivate' | null;
type UploadStep = { step: 'kind' } | { step: 'source'; kind: DocumentKind } | null;

/** Perfil del empleado (D-057, D-172 a D-175, D-181 a D-184): encabezado con interruptor Activo y pestañas Datos, Permisos y Pagos. */
export default function EmployeeProfileScreen() {
  const { id, invitation } = useLocalSearchParams<{ id: string; invitation?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { locale, profile } = useSession();
  const { access, can } = usePermissions();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('data');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [sheet, setSheet] = useState<ConfirmSheet>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [upload, setUpload] = useState<UploadStep>(null);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState<'upload' | 'open' | 'camera' | null>(null);

  const load = useCallback(async () => {
    const result = await fetchEmployee(id);
    if (result.ok) {
      setEmployee(result.data);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
  }, [id]);

  const loadDocuments = useCallback(async () => {
    const result = await fetchDocuments(id);
    if (result.ok) setDocuments(result.data);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const documentsVisible = employee ? showsDocuments(access, employee) : false;
  useEffect(() => {
    if (documentsVisible) void loadDocuments();
  }, [documentsVisible, loadDocuments]);

  if (!can('empleados_ver')) return <Redirect href="/" />;

  const canEdit = employee ? canEditEmployee(access, employee) : false;
  const canToggle = employee ? canToggleActive(access, employee, profile?.id ?? null) : false;

  function startEditing() {
    if (!employee) return;
    setForm(editFormFrom(employee));
    setNameError(false);
    setSaveError(false);
    setEditing(true);
  }

  async function save() {
    if (!employee || !form || saving) return;
    const errors = validateEdit(form);
    setNameError(Boolean(errors.fullName));
    if (errors.fullName) return;
    if (!editChanged(employee, form)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(false);
    const result = await updateEmployee(employee.id, form);
    setSaving(false);
    if (!result.ok) {
      setSaveError(true);
      return;
    }
    await load();
    setEditing(false);
  }

  async function confirmToggle() {
    if (!employee || !sheet || toggling) return;
    setToggling(true);
    setToggleError(false);
    const result = await setEmployeeActive(employee.id, sheet === 'reactivate');
    setToggling(false);
    setSheet(null);
    if (!result.ok) {
      setToggleError(true);
      return;
    }
    await load();
  }

  async function sendInvitation() {
    if (!employee || resend === 'sending') return;
    setResend('sending');
    const result = await resendInvitation(employee.id);
    setResend(result.ok ? 'sent' : 'error');
  }

  async function afterPick(kind: DocumentKind, picked: PickResult) {
    if (!employee) return;
    if (picked.kind === 'denied') {
      setDocumentError('camera');
      return;
    }
    if (picked.kind === 'cancelled') return;
    setUploading(true);
    const result = await uploadDocument(employee.id, kind, picked.file);
    setUploading(false);
    if (!result.ok) {
      setDocumentError('upload');
      return;
    }
    await loadDocuments();
  }

  async function pickAndUpload(source: 'camera' | 'file') {
    if (upload?.step !== 'source') return;
    const kind = upload.kind;
    setUpload(null);
    setDocumentError(null);
    try {
      await afterPick(kind, source === 'camera' ? await takePhoto() : await chooseFile());
    } catch {
      setUploading(false);
      setDocumentError('upload');
    }
  }

  async function open(documentId: string) {
    setDocumentError(null);
    const result = await openDocument(documentId);
    if (!result.ok) setDocumentError('open');
  }

  const title = employee?.fullName ?? '';
  const topAction =
    tab === 'data' && employee && canEdit
      ? editing
        ? { label: strings.common.cancel, onPress: () => setEditing(false), accessibilityLabel: strings.common.cancel }
        : { label: strings.common.edit, onPress: startEditing, accessibilityLabel: strings.common.edit }
      : undefined;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title={title} onBack={goBack} backLabel={strings.common.back} action={topAction} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed && !employee ? <AppAlert tone="error" text={strings.employee.errorLoad} /> : null}
        {employee ? (
          <>
            {invitation === 'failed' ? <AppAlert text={strings.employee.invitationFailed} /> : null}
            {toggleError ? <AppAlert tone="error" text={strings.employee.errorToggle} /> : null}

            <View style={styles.header}>
              <View style={styles.who}>
                <Avatar name={employee.fullName} size={48} />
                <View style={{ flex: 1 }}>
                  <AppText weight="medium" size={sample.headingSize}>
                    {employee.fullName}
                  </AppText>
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {subtitle(strings, employee)}
                  </AppText>
                </View>
              </View>
              {canToggle ? (
                <View style={styles.toggle}>
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {strings.employee.activeLabel}
                  </AppText>
                  <Switch
                    value={employee.active}
                    accessibilityLabel={strings.employee.activeLabel}
                    onChange={(next) => setSheet(next ? 'reactivate' : 'deactivate')}
                  />
                </View>
              ) : (
                <Chip
                  label={employee.active ? strings.employees.active : strings.employees.inactive}
                  tone={employee.active ? 'success' : 'neutral'}
                />
              )}
            </View>

            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'data', label: strings.employee.tabData },
                { key: 'permissions', label: strings.employee.tabPermissions },
                { key: 'pay', label: strings.employee.tabPay },
              ]}
            />

            {/* TEMPORAL: Permisos y Pagos se construyen en órdenes siguientes. */}
            {tab !== 'data' ? <View style={{ height: 160 }}><PendingBody /></View> : null}

            {tab === 'data' && !editing ? (
              <DataSection
                employee={employee}
                strings={strings}
                locale={locale}
                canResend={canResendInvitation(access, employee)}
                resend={resend}
                onResend={() => void sendInvitation()}
              />
            ) : null}

            {tab === 'data' && editing && form ? (
              <KeyboardForm>
                <AppField
                  label={strings.newEmployee.name}
                  value={form.fullName}
                  onChangeText={(v) => setForm({ ...form, fullName: v })}
                  autoCapitalize="words"
                  error={nameError ? strings.newEmployee.errorName : null}
                />
                <AppField
                  label={strings.employee.phone}
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  keyboardType="phone-pad"
                />
                <DataRow label={strings.employee.email} value={employee.email ?? '—'} />
                {employee.workerType !== null ? (
                  <View style={{ paddingTop: 8 }}>
                    <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
                      {strings.newEmployee.type}
                    </AppText>
                    <Segmented
                      options={[
                        { value: 'w2', label: strings.employees.w2 },
                        { value: '1099', label: strings.employees.contractor },
                      ]}
                      value={form.workerType}
                      onChange={(v) => setForm({ ...form, workerType: v })}
                    />
                  </View>
                ) : null}
                <DataRow label={strings.newEmployee.role} value={roleLabel(strings, employee.role, employee.isSuperAdmin)} />
                <View style={{ paddingTop: 8 }}>
                  <SelectField
                    label={strings.newEmployee.language}
                    options={[
                      { value: 'en', label: strings.profile.english },
                      { value: 'es', label: strings.profile.spanish },
                    ]}
                    value={form.language}
                    onChange={(v) => setForm({ ...form, language: v })}
                  />
                </View>
                <DataRow label={strings.employee.appAccess} value={accessText(employee, strings, locale)} last />
                {saveError ? <AppAlert tone="error" text={strings.employee.errorSave} /> : null}
                <View style={{ height: 8 }} />
                <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
              </KeyboardForm>
            ) : null}

            {tab === 'data' && documentsVisible ? (
              <View>
                <AppText size={sample.labelSize} color={colors.secondary} style={styles.sectionLabel}>
                  {strings.employee.documents}
                </AppText>
                {documentRows(documents).map((row, i, rows) => (
                  <ListRow
                    key={row.kind}
                    title={row.kind === 'w9' ? strings.employee.w9 : strings.employee.insuranceCertificate}
                    detail={
                      row.state === 'uploaded' && row.uploadedAt
                        ? strings.employee.uploadedOn(formatDate(row.uploadedAt, locale))
                        : strings.employee.noFile
                    }
                    last={i === rows.length - 1}
                    onPress={row.documentId ? () => void open(row.documentId as string) : undefined}
                    right={
                      <Chip
                        label={row.state === 'uploaded' ? strings.employee.uploadedChip : strings.employee.missingChip}
                        tone={row.state === 'uploaded' ? 'success' : 'warning'}
                      />
                    }
                  />
                ))}
                <View style={{ height: 8 }} />
                {documentError ? (
                  <AppAlert
                    tone="error"
                    text={
                      documentError === 'camera'
                        ? strings.employee.errorCamera
                        : documentError === 'open'
                          ? strings.employee.errorOpen
                          : strings.employee.errorUpload
                    }
                  />
                ) : null}
                <AppButton
                  label={strings.employee.upload}
                  variant="outline"
                  icon="upload"
                  disabled={uploading}
                  onPress={() => {
                    setDocumentError(null);
                    setUpload({ step: 'kind' });
                  }}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={sheet !== null} onClose={() => setSheet(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {sheet === 'deactivate'
            ? strings.employee.deactivateTitle(employee?.fullName ?? '')
            : strings.employee.reactivateTitle(employee?.fullName ?? '')}
        </AppText>
        {sheet === 'deactivate' ? (
          <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
            {strings.employee.deactivateBody}
          </AppText>
        ) : null}
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setSheet(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={sheet === 'deactivate' ? strings.employee.deactivate : strings.employee.reactivate}
              onPress={() => void confirmToggle()}
              disabled={toggling}
            />
          </View>
        </View>
      </Sheet>

      <Sheet visible={upload !== null} onClose={() => setUpload(null)}>
        <AppText weight="medium" size={sample.headingSize} center style={{ marginBottom: 12 }}>
          {strings.employee.upload}
        </AppText>
        <View style={{ gap: 8 }}>
          {upload?.step === 'kind' ? (
            <>
              <AppButton label={strings.employee.w9} variant="outline" onPress={() => setUpload({ step: 'source', kind: 'w9' })} />
              <AppButton
                label={strings.employee.insuranceCertificate}
                variant="outline"
                onPress={() => setUpload({ step: 'source', kind: 'insurance_certificate' })}
              />
            </>
          ) : (
            <>
              <AppButton label={strings.employee.takePhoto} variant="outline" onPress={() => void pickAndUpload('camera')} />
              <AppButton label={strings.employee.chooseFile} variant="outline" onPress={() => void pickAndUpload('file')} />
            </>
          )}
          <AppButton label={strings.common.cancel} variant="text" onPress={() => setUpload(null)} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function KeyboardForm({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

function accessText(e: Employee, strings: Strings, locale: 'en' | 'es'): string {
  const state = accessState(e);
  if (state.kind === 'none') return strings.common.no;
  if (state.kind === 'pending') return strings.employee.invitationSent;
  return strings.employee.accessSince(formatDate(state.since, locale));
}

/** Pestaña Datos en solo lectura (D-174): Nombre, Teléfono, Correo, Tipo, Rol de partida, Idioma y Acceso a la app. */
function DataSection({
  employee,
  strings,
  locale,
  canResend,
  resend,
  onResend,
}: {
  employee: Employee;
  strings: Strings;
  locale: 'en' | 'es';
  canResend: boolean;
  resend: 'idle' | 'sending' | 'sent' | 'error';
  onResend: () => void;
}) {
  const { colors } = useTheme();
  const state = accessState(employee);
  return (
    <View>
      <DataRow label={strings.newEmployee.name} value={employee.fullName} />
      <DataRow label={strings.employee.phone} value={employee.phone ?? '—'} />
      <DataRow label={strings.employee.email} value={employee.email ?? '—'} />
      {employee.workerType !== null ? (
        <DataRow label={strings.newEmployee.type} value={typeLabel(strings, employee.workerType)} />
      ) : null}
      <DataRow label={strings.newEmployee.role} value={roleLabel(strings, employee.role, employee.isSuperAdmin)} />
      <DataRow
        label={strings.newEmployee.language}
        value={employee.language === 'es' ? strings.profile.spanish : strings.profile.english}
      />
      <DataRow
        label={strings.employee.appAccess}
        value={accessText(employee, strings, locale)}
        last
        right={state.kind === 'pending' ? <Chip label={strings.employee.pendingChip} tone="warning" /> : undefined}
      />
      {canResend ? (
        <View style={{ marginTop: 8 }}>
          {resend === 'error' ? <AppAlert tone="error" text={strings.employee.errorResend} /> : null}
          <AppButton
            label={strings.employee.resendInvitation}
            variant="outline"
            disabled={resend === 'sending'}
            onPress={onResend}
          />
          {resend === 'sent' ? (
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 6 }}>
              {strings.employee.invitationResent}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { marginTop: 10, marginBottom: 2 },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
