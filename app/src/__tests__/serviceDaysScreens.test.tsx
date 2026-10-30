import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// Días de servicio de los 1099 (órdenes 53 y 54; D-275, D-276, D-279, D-286).
const mockPush = jest.fn();
const mockComplete = jest.fn();
const mockMyDays = jest.fn();
const mockApproveDay = jest.fn();
const mockReturnDay = jest.fn();
const mockRecordApprove = jest.fn();
const mockEditAmount = jest.fn();
const mockStatement = jest.fn();
const mockVisitWork = jest.fn();
const mockAddable = jest.fn();
const mockApproveVisit = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, navigate: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'v1' }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: false, permissions: new Set() };
let mockWorker: 'w2' | '1099' = '1099';
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: mockAccess, isSuperAdmin: mockAccess.isSuperAdmin, can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k) }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo', fullName: 'Humberto V.', workerType: mockWorker } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));
jest.mock('@/lib/serviceDays', () => ({
  ...jest.requireActual('@/lib/serviceDays'),
  completeServiceDay: (...a: unknown[]) => mockComplete(...a),
  fetchMyServiceDays: (...a: unknown[]) => mockMyDays(...a),
  approveServiceDay: (...a: unknown[]) => mockApproveDay(...a),
  returnServiceDay: (...a: unknown[]) => mockReturnDay(...a),
  recordAndApproveServiceDay: (...a: unknown[]) => mockRecordApprove(...a),
  editServiceDayAmount: (...a: unknown[]) => mockEditAmount(...a),
  fetchStatement: (...a: unknown[]) => mockStatement(...a),
}));
jest.mock('@/lib/scheduleApi', () => ({
  fetchVisitWork: (...a: unknown[]) => mockVisitWork(...a),
  fetchAddableStaff: (...a: unknown[]) => mockAddable(...a),
  approveVisit: (...a: unknown[]) => mockApproveVisit(...a),
  markNoShow: jest.fn(async () => ({ ok: true, data: null })),
  undoNoShow: jest.fn(),
  recordWork: jest.fn(),
  editWorkEntry: jest.fn(),
  reviewGps: jest.fn(),
}));
jest.mock('@/lib/sharePdf', () => ({ sharePdf: jest.fn(async () => 'shared'), shareCsv: jest.fn(async () => 'shared'), shareAvailable: () => true }));

import { ServiceDayCard } from '@/components/work/ServiceDayCard';
import MyServiceDaysScreen from '@/app/(app)/my-service-days';
import WorkScreen from '@/app/(app)/schedule/work/[id]';
import StatementScreen from '@/app/(app)/accounting/statement';
import { parseMyServiceDays, parseStatement, statementCsv, statusTone } from '@/lib/serviceDays';

const visit = {
  id: 'v1',
  jobsite: 'Naples Yacht Club',
  address: '',
  day: '2026-10-30',
  startsAt: new Date(2026, 9, 30, 23, 0),
  minutes: 240,
  scheduled: true,
  entry: null,
  serviceDay: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: false, permissions: new Set() };
  mockWorker = '1099';
});

describe('reglas', () => {
  it('lee Mis días y el estado de cuenta; fichas y CSV', () => {
    const d = parseMyServiceDays({ month: '2026-10-01', rows: [{ id: 'd1', visit_id: 'v1', date: '2026-10-30', account: 'NYC', status: 'pending', note: null }], approved: 2, pending: 1 });
    expect(d).toMatchObject({ approved: 2, pending: 1, needsCorrection: 0, rows: [{ visitId: 'v1', status: 'pending' }] });
    expect([statusTone('pending'), statusTone('needs_correction'), statusTone('approved')]).toEqual(['muted', 'warning', 'success']);
    const st = parseStatement({ month: '2026-10-01', closes_on: '2026-10-31', due_on: '2026-11-07', rows: [{ profile_id: 'p1', name: 'Humberto V.', days: 12, edited: 0, days_amount: '960', fixed_amount: 0, amount: '960' }] });
    expect(statementCsv(st, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('a,b,c,d,e,f,g\nHumberto V.,12,0,960.00,0.00,960.00,2026-11-07\n');
  });
});

describe('Inicio del 1099 (D-286 (1))', () => {
  it('franja de acceso del cliente y "Marcar como completado", sin clock in ni ubicación', async () => {
    mockComplete.mockResolvedValue({ ok: true, data: { id: 'd1', status: 'pending' } });
    const changed = jest.fn();
    await render(<ServiceDayCard visit={visit} onChanged={changed} />);
    expect(screen.getByText('Hoy · Franja de acceso del cliente: 11:00 PM – 3:00 AM')).toBeTruthy();
    expect(screen.queryByText(/clock in|Desliza/i)).toBeNull();
    await fireEvent.press(screen.getByText('Marcar como completado'));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith('v1'));
    expect(changed).toHaveBeenCalled();
  });

  it('devuelto: la nota del admin y "Marcar de nuevo como completado"', async () => {
    await render(<ServiceDayCard visit={{ ...visit, serviceDay: { id: 'd1', status: 'needs_correction', note: 'Faltó la basura.' } }} onChanged={jest.fn()} />);
    expect(screen.getByText('Faltó la basura.')).toBeTruthy();
    expect(screen.getByText('Marcar de nuevo como completado')).toBeTruthy();
  });

  it('pendiente: ya no muestra el botón', async () => {
    await render(<ServiceDayCard visit={{ ...visit, serviceDay: { id: 'd1', status: 'pending', note: null } }} onChanged={jest.fn()} />);
    expect(screen.getByText('Marcado como completado · pendiente de aprobación')).toBeTruthy();
    expect(screen.queryByText('Marcar como completado')).toBeNull();
  });
});

describe('Mis días de servicio (D-279, D-286 (2))', () => {
  it('fichas por estado, la nota en ámbar y volver a marcar; sin horas ni dinero', async () => {
    mockMyDays.mockResolvedValue({
      ok: true,
      data: {
        month: '2026-10-01',
        approved: 1,
        pending: 1,
        needsCorrection: 1,
        rows: [
          { id: 'd3', visitId: 'v3', date: '2026-10-30', account: 'Naples Yacht Club', status: 'pending', note: null },
          { id: 'd2', visitId: 'v2', date: '2026-10-29', account: 'Naples Yacht Club', status: 'needs_correction', note: 'Faltó sacar la basura del muelle.' },
          { id: 'd1', visitId: 'v1', date: '2026-10-28', account: 'Naples Yacht Club', status: 'approved', note: null },
        ],
      },
    });
    mockComplete.mockResolvedValue({ ok: true, data: { id: 'd2', status: 'pending' } });
    await render(<MyServiceDaysScreen />);
    expect(await screen.findByText('Pendiente')).toBeTruthy();
    expect(screen.getByText('Requiere corrección')).toBeTruthy();
    expect(screen.getByText('Aprobado')).toBeTruthy();
    expect(screen.getByText('Oct 29 · nota del admin:')).toBeTruthy();
    expect(screen.queryByText(/\$| h /)).toBeNull();
    await fireEvent.press(screen.getByText('Marcar de nuevo como completado'));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith('v2'));
  });

  it('Mis horas lleva al 1099 a Mis días de servicio', async () => {
    const MyHours = require('@/app/(app)/my-hours').default;
    await render(<MyHours />);
    expect(screen.getByText('REDIRECT /my-service-days')).toBeTruthy();
  });
});

describe('To approve con 1099 (D-286 (3))', () => {
  const row = (o: Record<string, unknown>) => ({
    entryId: null,
    clockIn: null,
    clockOut: null,
    inStatus: null,
    outStatus: null,
    status: 'day_missing',
    distanceM: null,
    offline: false,
    unscheduled: false,
    manual: false,
    gpsPending: false,
    gpsReviewed: false,
    hasAppAccess: true,
    hasPay: true,
    contractor: true,
    serviceDay: null,
    ...o,
  });
  const day = (o: Record<string, unknown>) => ({ id: 'd1', status: 'pending', note: null, markedAt: new Date(2026, 9, 31, 3, 5), selfMarked: true, amount: null, amountEdited: false, expectedAmount: 80, ...o });
  const card = (rows: unknown[], o: Record<string, unknown> = {}) => ({
    id: 'v1',
    jobsiteId: 'j1',
    jobsite: 'Naples Yacht Club',
    client: 'Naples Yacht Club',
    day: '2026-10-30',
    startsAt: new Date(2026, 9, 30, 23, 0),
    minutes: 240,
    approved: false,
    w2Pending: false,
    ended: true,
    urgent: false,
    noShow: [],
    rows,
    ...o,
  });

  it('quien marcó: Aprobar · Devolver (nota obligatoria); sin acceso: Registrar y aprobar · No show; sin Approve de la visita', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['work_aprobar', 'work_registrar_por_otros']) };
    mockVisitWork.mockResolvedValue({
      ok: true,
      data: card([
        row({ profileId: 'p1', name: 'Humberto V.', status: 'day_pending', serviceDay: day({}) }),
        row({ profileId: 'p2', name: 'Estela M.', hasAppAccess: false }),
      ]),
    });
    mockApproveDay.mockResolvedValue({ ok: true, data: null });
    mockReturnDay.mockResolvedValue({ ok: true, data: null });
    mockRecordApprove.mockResolvedValue({ ok: true, data: 'd2' });
    await render(<WorkScreen />);
    expect(await screen.findByText('Marcado completado 3:05 AM')).toBeTruthy();
    expect(screen.getByText('Sin acceso a la app')).toBeTruthy();
    expect(screen.getByText('Programada')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Aprobar Humberto V.'));
    await waitFor(() => expect(mockApproveDay).toHaveBeenCalledWith('d1'));

    await fireEvent.press(screen.getByLabelText('Devolver Humberto V.'));
    expect(screen.getByText('Devolver: Requiere corrección')).toBeTruthy();
    const buttons = screen.getAllByText('Devolver');
    await fireEvent.press(buttons[buttons.length - 1]);
    expect(screen.getByText('Escribe la nota.')).toBeTruthy();
    expect(mockReturnDay).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Nota (obligatoria)'), 'Faltó la basura.');
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockReturnDay).toHaveBeenCalledWith('d1', 'Faltó la basura.'));

    await fireEvent.press(screen.getByLabelText('Registrar y aprobar Estela M.'));
    await waitFor(() => expect(mockRecordApprove).toHaveBeenCalledWith('v1', 'p2'));
  });

  it('+ Agregar persona: un 1099 se registra y aprueba sin horas', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['work_aprobar', 'work_registrar_por_otros']) };
    mockVisitWork.mockResolvedValue({ ok: true, data: card([row({ profileId: 'p2', name: 'Estela M.', hasAppAccess: false })]) });
    mockAddable.mockResolvedValue({ ok: true, data: [{ id: 'p9', name: 'Karina S.', hasPay: true, contractor: true }] });
    mockRecordApprove.mockResolvedValue({ ok: true, data: 'd9' });
    await render(<WorkScreen />);
    await fireEvent.press(await screen.findByText('+ Agregar persona'));
    await fireEvent.press(await screen.findByText('Karina S.'));
    await waitFor(() => expect(mockRecordApprove).toHaveBeenCalledWith('v1', 'p9'));
  });

  it('editar el monto de un día (D-276): pide el motivo; aprobado solo el Super Admin', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['work_aprobar', 'work_editar', 'empleados_ver_pagos']) };
    mockVisitWork.mockResolvedValue({
      ok: true,
      data: card([
        row({ profileId: 'p1', name: 'Humberto V.', status: 'day_pending', serviceDay: day({}) }),
        row({ profileId: 'p3', name: 'Karina S.', status: 'day_approved', serviceDay: day({ id: 'd3', status: 'approved', amount: 80, selfMarked: false }) }),
      ]),
    });
    mockEditAmount.mockResolvedValue({ ok: true, data: null });
    await render(<WorkScreen />);
    expect(await screen.findByLabelText('Editar monto Humberto V.')).toBeTruthy();
    expect(screen.queryByLabelText('Editar monto Karina S.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Editar monto Humberto V.'));
    await fireEvent.changeText(screen.getByLabelText('Monto'), '60');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getByText('Escribe un monto válido y el motivo.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Motivo (obligatorio)'), 'Medio día');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockEditAmount).toHaveBeenCalledWith('d1', 60, 'Medio día'));
  });
});

describe('Estado de cuenta (D-286 (4))', () => {
  it('por contratista, días, monto y "Pagar antes del"; el fijo mensual aparte; exportar', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['personal_ver_costo', 'reportes_exportar']) };
    mockStatement.mockResolvedValue({
      ok: true,
      data: {
        month: '2026-10-01',
        closesOn: '2026-10-31',
        dueOn: '2026-11-07',
        days: 27,
        amount: 2890,
        rows: [
          { profileId: 'p1', name: 'Humberto V.', days: 12, edited: 0, daysAmount: 960, fixedAmount: 0, amount: 960 },
          { profileId: 'p2', name: 'Estela M.', days: 8, edited: 0, daysAmount: 0, fixedAmount: 1350, amount: 1350 },
          { profileId: 'p3', name: 'Karina S.', days: 7, edited: 1, daysAmount: 580, fixedAmount: 0, amount: 580 },
        ],
      },
    });
    await render(<StatementScreen />);
    expect(await screen.findByText('12 días aprobados')).toBeTruthy();
    expect(screen.getByText('$960.00')).toBeTruthy();
    expect(screen.getAllByText('Pagar antes del Nov 7')).toHaveLength(2);
    expect(screen.getByText('8 días · fijo mensual')).toBeTruthy();
    expect(screen.getByText('mensual')).toBeTruthy();
    expect(screen.getByText('7 días aprobados · 1 editado')).toBeTruthy();
    await fireEvent.press(screen.getByText('CSV'));
    const { shareCsv } = require('@/lib/sharePdf');
    await waitFor(() => expect(shareCsv).toHaveBeenCalledWith(expect.stringContaining('Humberto V.,12,0,960.00'), 'estado-de-cuenta-2026-10.csv', 'Estado de cuenta'));
  });

  it('sin el permiso de costo de personal no entra', async () => {
    await render(<StatementScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});
