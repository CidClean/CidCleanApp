import { Redirect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/FormScroll';
import { Dialog } from '@/components/Dialog';
import { DialogButtons } from '@/components/work/SimpleParts';
import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { PhoneField } from '@/components/PhoneField';
import { EmployeePay } from '@/components/clients/EmployeePay';
import { formatPhone } from '@/lib/phone';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import { DataRow } from '@/components/DataRow';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { PermissionsTab } from '@/components/PermissionsTab';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { Tabs } from '@/components/Tabs';
import { TopBar } from '@/components/TopBar';
import { W9ProfileSection } from '@/components/w9/W9ProfileSection';
import { useStrings } from '@/i18n/useStrings';
import type { Strings } from '@/i18n/es';
import { chooseFile, fetchDocuments, takePhoto, uploadDocument, type PickResult } from '@/lib/documents';
import { roleLabel, subtitle, typeLabel } from '@/lib/employeeLabels';
import {
  accessState,
  canEditEmployee,
  canGrantAccess,
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
  type RoleKey,
} from '@/lib/employeeRules';
import {
  fetchEmployee,
  fetchEmployeePermissions,
  fetchTemplatePermissions,
  grantAppAccess,
  resendInvitation,
  saveEmployeePermissions,
  setEmployeeActive,
  updateEmployee,
} from '@/lib/employeesApi';
import { useGoBack } from '@/lib/navigation';
import {
  applyTemplate,
  canSeePay,
  diffPermissions,
  hasPendingChanges,
  heldKeys,
  permissionsMode,
  roleToSave,
  toggled,
  visibleAreas,
} from '@/lib/permissionsRules';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Tab = 'data' | 'permissions' | 'pay';
type ConfirmSheet = 'deactivate' | 'reactivate' | null;
type UploadStep = { step: 'kind' } | { step: 'source'; kind: DocumentKind } | null;

/** Perfil del empleado (D-057, D-172 a D-175, D-181 a D-184): encabezado con interruptor Activo y pestañas Datos, Permisos y Pagos. */
export default function EmployeeProfileScreen() {
  const { id, invitation } = useLocalSearchParams<{
    id: string;
    invitation?: string;
  }>();
  const goBack = useGoBack();
  const router = useRouter();
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
  const [phoneError, setPhoneError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [sheet, setSheet] = useState<ConfirmSheet>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  // D-242: invitar a la app a quien se creó sin acceso.
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteDone, setInviteDone] = useState<'sent' | 'failed' | null>(null);

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [upload, setUpload] = useState<UploadStep>(null);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState<'upload' | 'camera' | null>(null);

  // Pestaña Permisos (D-188 a D-192): lo guardado, lo que se quiere guardar y el rol de la última plantilla aplicada.
  const [permLoad, setPermLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [savedPerms, setSavedPerms] = useState<ReadonlySet<string>>(new Set());
  const [wantedPerms, setWantedPerms] = useState<ReadonlySet<string>>(new Set());
  const [pendingRole, setPendingRole] = useState<RoleKey | null>(null);
  const [templateAsk, setTemplateAsk] = useState<RoleKey | null>(null);
  const [applying, setApplying] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState<'load' | 'template' | 'save' | null>(null);
  const insets = useSafeAreaInsets();

  // Salir de Permisos con cambios sin guardar pide confirmación (decisión del arquitecto bajo D-200, orden 12):
  // al cambiar de pestaña, con la flecha de volver y con el botón o gesto de atrás del teléfono (beforeRemove).
  type LeaveAsk = { kind: 'tab'; tab: Tab } | { kind: 'back' } | { kind: 'screen'; action: unknown } | null;
  const [leaveAsk, setLeaveAsk] = useState<LeaveAsk>(null);
  const dirtyRef = useRef(false);
  type BeforeRemove = { preventDefault: () => void; data: { action: unknown } };
  const navigation = useNavigation() as unknown as {
    addListener: (event: 'beforeRemove', listener: (e: BeforeRemove) => void) => () => void;
    dispatch: (action: unknown) => void;
  };
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      setLeaveAsk({ kind: 'screen', action: e.data.action });
    });
    return unsubscribe;
  }, [navigation]);

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

  const targetIsSuper = employee?.isSuperAdmin ?? false;
  const loadPermissions = useCallback(async () => {
    const result = await fetchEmployeePermissions(id);
    if (!result.ok) {
      setPermLoad('error');
      return;
    }
    const set = new Set(result.data);
    setSavedPerms(set);
    setWantedPerms(set);
    setPendingRole(null);
    setPermLoad('ready');
  }, [id]);

  // El Super Admin no necesita leer nada: tiene todos los permisos (D-192).
  useEffect(() => {
    if (employee && !targetIsSuper) void loadPermissions();
  }, [employee?.id, targetIsSuper, loadPermissions]);

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
    setPhoneError(Boolean(errors.phone));
    if (errors.fullName || errors.phone) return;
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

  /** Cambiar la plantilla pide confirmación (D-189); al confirmar, sus permisos quedan como cambios pendientes. */
  async function confirmTemplate() {
    if (!templateAsk || applying) return;
    setApplying(true);
    setPermError(null);
    const result = await fetchTemplatePermissions(templateAsk);
    setApplying(false);
    if (!result.ok) {
      setTemplateAsk(null);
      setPermError('template');
      return;
    }
    setWantedPerms(applyTemplate(wantedPerms, result.data, heldKeys(access)));
    setPendingRole(templateAsk);
    setTemplateAsk(null);
  }

  /** Guardar cambios (D-188): todos los permisos pendientes juntos y, si se aplicó una plantilla, su rol (D-190). */
  async function savePermissions() {
    if (!employee || permSaving) return;
    const changes = diffPermissions(savedPerms, wantedPerms);
    const role = roleToSave(employee.role, pendingRole ?? employee.role);
    setPermSaving(true);
    setPermError(null);
    const result = await saveEmployeePermissions(employee.id, changes, role);
    setPermSaving(false);
    if (!result.ok) {
      setPermError('save');
      return;
    }
    await Promise.all([load(), loadPermissions()]);
  }

  async function sendInvitation() {
    if (!employee || resend === 'sending') return;
    setResend('sending');
    const result = await resendInvitation(employee.id);
    setResend(result.ok ? 'sent' : 'error');
  }

  async function sendAccess() {
    if (!employee || inviteBusy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteError(strings.employee.inviteEmailError);
      return;
    }
    setInviteBusy(true);
    const result = await grantAppAccess(employee.id, inviteEmail);
    setInviteBusy(false);
    if (!result.ok) {
      setInviteError(
        result.reason === 'email_taken' ? strings.newEmployee.errorEmailTaken : strings.employee.inviteError,
      );
      return;
    }
    setInviting(false);
    setInviteDone(result.data);
    await load();
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

  /** Abre el documento en el visor de la app (D-196); open-document deja la apertura en el historial (D-125). */
  function open(documentId: string, kind: DocumentKind) {
    setDocumentError(null);
    router.push({
      pathname: '/viewer',
      params: {
        source: 'document',
        documentId,
        title: kind === 'w9' ? strings.employee.w9 : strings.employee.insuranceCertificate,
        // D-260: el W-9 lo descarga el Super Admin.
        ...(kind === 'w9' ? { download: '1' } : {}),
      },
    });
  }

  const mode = employee ? permissionsMode(access, employee, profile?.id ?? null) : 'readonly';
  const shownRole: RoleKey = pendingRole ?? employee?.role ?? 'employee';
  const pendingChanges = employee
    ? hasPendingChanges(diffPermissions(savedPerms, wantedPerms), employee.role, shownRole)
    : false;
  const showSaveBar = tab === 'permissions' && mode === 'edit' && permLoad === 'ready';
  dirtyRef.current = mode === 'edit' && permLoad === 'ready' && pendingChanges && !permSaving;

  function changeTab(next: Tab) {
    if (tab === 'permissions' && next !== 'permissions' && dirtyRef.current) setLeaveAsk({ kind: 'tab', tab: next });
    else setTab(next);
  }

  /** "Salir" en la hoja: se descartan los cambios pendientes y se sigue a donde se iba. */
  function leaveWithoutSaving() {
    const ask = leaveAsk;
    setLeaveAsk(null);
    if (!ask) return;
    setWantedPerms(savedPerms);
    setPendingRole(null);
    dirtyRef.current = false;
    if (ask.kind === 'tab') setTab(ask.tab);
    else if (ask.kind === 'back') goBack();
    else navigation.dispatch(ask.action);
  }

  const title = employee?.fullName ?? '';
  const topAction =
    tab === 'data' && employee && canEdit
      ? editing
        ? {
            label: strings.common.cancel,
            onPress: () => setEditing(false),
            accessibilityLabel: strings.common.cancel,
          }
        : {
            label: strings.common.edit,
            onPress: startEditing,
            accessibilityLabel: strings.common.edit,
          }
      : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={title}
        onBack={() => (dirtyRef.current ? setLeaveAsk({ kind: 'back' }) : goBack())}
        backLabel={strings.common.back}
        action={topAction}
      />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed && !employee ? <AppAlert tone="error" text={strings.employee.errorLoad} /> : null}
        {employee ? (
          <>
            {invitation === 'failed' ? <AppAlert text={strings.employee.invitationFailed} /> : null}
            {toggleError ? <AppAlert tone="error" text={strings.employee.errorToggle} /> : null}

            {/* D-226: el encabezado del perfil en una tarjeta blanca de 24px. */}
            <View
              style={[
                styles.header,
                {
                  backgroundColor: colors.card,
                  borderRadius: radius.card,
                  padding: 16,
                },
              ]}
            >
              <View style={styles.who}>
                <Avatar name={employee.fullName} size={48} />
                <View style={{ flex: 1 }}>
                  <AppText weight="heavy" size={20}>
                    {employee.fullName}
                  </AppText>
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {subtitle(strings, employee)}
                  </AppText>
                </View>
              </View>
              {canToggle && !editing ? (
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
              onChange={changeTab}
              tabs={[
                { key: 'data', label: strings.employee.tabData },
                { key: 'permissions', label: strings.employee.tabPermissions },
                { key: 'pay', label: strings.employee.tabPay },
              ]}
            />

            {tab === 'permissions' ? (
              <View>
                {permError === 'save' ? <AppAlert tone="error" text={strings.employee.errorSave} /> : null}
                {permError === 'template' ? <AppAlert tone="error" text={strings.permissions.errorTemplate} /> : null}
                {mode !== 'locked' && permLoad === 'error' ? (
                  <AppAlert tone="error" text={strings.permissions.errorLoad} />
                ) : null}
                {mode !== 'locked' && permLoad === 'loading' ? <BrandLoading size={56} center={false} label={strings.common.loading} /> : null}
                {mode === 'locked' || permLoad === 'ready' ? (
                  <PermissionsTab
                    strings={strings}
                    mode={mode}
                    areas={visibleAreas(access, wantedPerms, mode === 'locked')}
                    on={wantedPerms}
                    onToggle={(key, value) => setWantedPerms(toggled(wantedPerms, key, value))}
                    template={mode === 'edit' ? (templateAsk ?? shownRole) : null}
                    onTemplate={setTemplateAsk}
                  />
                ) : null}
              </View>
            ) : null}

            {/* Pagos (D-194, D-210): sin empleados_ver_pagos, el aviso y ninguna cifra; con el permiso, su pago en cada jobsite. */}
            {tab === 'pay' && canSeePay(access) && employee ? (
              <EmployeePay profileId={employee.id} workerType={employee.workerType} />
            ) : null}
            {tab === 'pay' && !canSeePay(access) ? (
              <View style={styles.noPay}>
                <Icon name="lock" size={26} strokeWidth={iconStrokeWidth} color={colors.secondary} />
                <AppText weight="medium">{strings.permissions.noPayPermission}</AppText>
              </View>
            ) : null}

            {tab === 'data' && !editing ? (
              <DataSection
                employee={employee}
                strings={strings}
                locale={locale}
                canResend={canResendInvitation(access, employee)}
                resend={resend}
                onResend={() => void sendInvitation()}
                canInvite={canGrantAccess(access, employee)}
                inviteDone={inviteDone}
                onInvite={() => {
                  setInviteEmail(employee.email ?? '');
                  setInviteError(null);
                  setInviting(true);
                }}
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
                <PhoneField
                  label={strings.employee.phone}
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  error={phoneError ? strings.common.phoneError : null}
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
                <DataRow
                  label={strings.newEmployee.role}
                  value={roleLabel(strings, employee.role, employee.isSuperAdmin)}
                />
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
                      row.kind === 'w9' && row.state === 'uploaded' && !access.isSuperAdmin
                        ? strings.employee.w9OnlySuperAdmin
                        : row.state === 'uploaded' && row.uploadedAt
                        ? strings.employee.uploadedOn(formatDate(row.uploadedAt, locale))
                        : strings.employee.noFile
                    }
                    last={i === rows.length - 1}
                    onPress={row.documentId && (row.kind !== 'w9' || access.isSuperAdmin) ? () => open(row.documentId as string, row.kind) : undefined}
                    right={
                      <Chip
                        label={row.state === 'uploaded' ? strings.employee.uploadedChip : strings.employee.missingChip}
                        tone={row.state === 'uploaded' ? 'success' : 'warning'}
                      />
                    }
                  />
                ))}
                {/* D-256: W-9 por llenar, debajo de las filas de Documentos. */}
                <W9ProfileSection
                  profileId={employee.id}
                  fullName={employee.fullName}
                  email={employee.email}
                  locale={locale}
                  currentW9DocumentId={documents.find((d) => d.kind === 'w9')?.id ?? null}
                  onChanged={() => void loadDocuments()}
                />
                <View style={{ height: 8 }} />
                {documentError ? (
                  <AppAlert
                    tone="error"
                    text={documentError === 'camera' ? strings.employee.errorCamera : strings.employee.errorUpload}
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
      </FormScroll>

      {showSaveBar ? (
        <View
          style={[
            styles.saveBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: 10 + insets.bottom,
            },
          ]}
        >
          <AppButton
            label={strings.permissions.saveChanges}
            onPress={() => void savePermissions()}
            disabled={!pendingChanges || permSaving}
          />
        </View>
      ) : null}

      <Sheet visible={leaveAsk !== null} onClose={() => setLeaveAsk(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {strings.unsaved.title}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
          {strings.unsaved.body}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setLeaveAsk(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={strings.unsaved.leave} onPress={leaveWithoutSaving} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={templateAsk !== null} onClose={() => setTemplateAsk(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {strings.permissions.applyTitle(templateAsk ? roleLabel(strings, templateAsk) : '')}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} center style={{ marginTop: 4 }}>
          {strings.permissions.applyBody(employee?.fullName ?? '')}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setTemplateAsk(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={strings.permissions.apply} onPress={() => void confirmTemplate()} disabled={applying} />
          </View>
        </View>
      </Sheet>

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
              <AppButton
                label={strings.employee.w9}
                variant="outline"
                onPress={() => setUpload({ step: 'source', kind: 'w9' })}
              />
              <AppButton
                label={strings.employee.insuranceCertificate}
                variant="outline"
                onPress={() => setUpload({ step: 'source', kind: 'insurance_certificate' })}
              />
            </>
          ) : (
            <>
              <AppButton
                label={strings.employee.takePhoto}
                variant="outline"
                onPress={() => void pickAndUpload('camera')}
              />
              <AppButton
                label={strings.employee.chooseFile}
                variant="outline"
                onPress={() => void pickAndUpload('file')}
              />
            </>
          )}
          <AppButton label={strings.common.cancel} variant="text" onPress={() => setUpload(null)} />
        </View>
      </Sheet>
      <InviteDialog
        visible={inviting}
        name={employee?.fullName ?? ''}
        email={inviteEmail}
        error={inviteError}
        busy={inviteBusy}
        strings={strings}
        onChange={setInviteEmail}
        onClose={() => setInviting(false)}
        onSend={() => void sendAccess()}
      />
    </View>
  );
}

function InviteDialog(props: {
  visible: boolean;
  name: string;
  email: string;
  error: string | null;
  busy: boolean;
  strings: Strings;
  onChange: (v: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const { colors } = useTheme();
  const t = props.strings.employee;
  return (
    <Dialog visible={props.visible} onClose={props.onClose}>
      <AppText weight="heavy" size={17}>
        {t.inviteTitle(props.name)}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary}>
        {t.inviteNote}
      </AppText>
      {props.error ? <AppAlert tone="error" text={props.error} /> : null}
      <AppField
        label={t.email}
        value={props.email}
        onChangeText={props.onChange}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <DialogButtons
        cancel={props.strings.common.cancel}
        save={t.sendInvitation}
        onCancel={props.onClose}
        onSave={props.onSend}
        disabled={props.busy}
      />
    </Dialog>
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
  canInvite,
  inviteDone,
  onInvite,
}: {
  employee: Employee;
  strings: Strings;
  locale: 'en' | 'es';
  canResend: boolean;
  resend: 'idle' | 'sending' | 'sent' | 'error';
  onResend: () => void;
  canInvite: boolean;
  inviteDone: 'sent' | 'failed' | null;
  onInvite: () => void;
}) {
  const { colors } = useTheme();
  const state = accessState(employee);
  return (
    <View>
      <CardBlock>
        <DataRow label={strings.newEmployee.name} value={employee.fullName} />
        <DataRow label={strings.employee.phone} value={employee.phone ? formatPhone(employee.phone) : '—'} />
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
      </CardBlock>
      {canInvite ? (
        <View style={{ marginTop: 8 }}>
          <AppButton label={strings.employee.inviteToApp} variant="outline" icon="mail" onPress={onInvite} />
        </View>
      ) : null}
      {inviteDone === 'sent' ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 6 }}>
          {strings.employee.inviteSent}
        </AppText>
      ) : null}
      {inviteDone === 'failed' ? <AppAlert text={strings.employee.invitationFailed} /> : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { marginTop: 10, marginBottom: 2 },
  noPay: { alignItems: 'center', gap: 8, paddingVertical: 26 },
  saveBar: { borderTopWidth: 0.5, paddingTop: 10, paddingHorizontal: 12 },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
