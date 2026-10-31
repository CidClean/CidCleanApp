import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPosition = jest.fn();
const mockCheck = jest.fn();
const mockClockIn = jest.fn();
const mockEnqueue = jest.fn();
const mockVisitWork = jest.fn();
const mockApprove = jest.fn();
const mockNoShow = jest.fn();
const mockRecord = jest.fn();

jest.mock('@/lib/contractApi', () => ({ fetchContractInfo: async () => ({ ok: true, data: null }), fetchCleaningType: async () => null, saveCleaningType: async () => true, fetchUnsignedJobsites: async () => new Set(), fetchContractPreviewUrl: async () => ({ ok: false, reason: 'server' }), contractStep: () => 1, fieldsToShow: () => [] })); // D-289
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, navigate: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'v1' }),
  // Como expo-router: se vuelve a correr cuando cambia la función.
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
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: mockAccess, isSuperAdmin: mockAccess.isSuperAdmin, can: () => mockAccess.isSuperAdmin }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));
// La pista se prueba aparte: aquí basta con un botón que la complete.
jest.mock('@/components/SlideToMark', () => ({
  SlideToMark: ({ label, onComplete }: { label: string; onComplete: () => void }) => {
    const { Text } = require('react-native');
    return <Text onPress={onComplete}>{label}</Text>;
  },
}));
jest.mock('@/lib/location', () => ({ currentPosition: () => mockPosition(), locationAvailable: () => true }));
jest.mock('@/lib/workQueue', () => ({
  enqueue: (...a: unknown[]) => mockEnqueue(...a),
  loadShift: jest.fn(async () => null),
  saveShift: jest.fn(async () => undefined),
  syncWorkQueue: jest.fn(async () => 'synced'),
}));
jest.mock('@/lib/scheduleApi', () => ({
  checkDistance: (...a: unknown[]) => mockCheck(...a),
  clockIn: (...a: unknown[]) => mockClockIn(...a),
  clockOut: jest.fn(),
  fetchVisitWork: (...a: unknown[]) => mockVisitWork(...a),
  approveVisit: (...a: unknown[]) => mockApprove(...a),
  editWorkEntry: jest.fn(),
  recordWork: (...a: unknown[]) => mockRecord(...a),
  reviewGps: jest.fn(),
  markNoShow: (...a: unknown[]) => mockNoShow(...a),
  undoNoShow: jest.fn(async () => ({ ok: true, data: null })),
  fetchAddableStaff: jest.fn(async () => ({ ok: true, data: [{ id: 'p9', name: 'Sustituto', hasPay: false }] })),
  fetchSchedule: (...a: unknown[]) => mockSchedule(...a),
  fetchToApprove: jest.fn(async () => ({ ok: true, data: [] })),
  fetchSchedulable: jest.fn(async () => ({
    ok: true,
    data: [
      { id: 'p1', name: 'Rosemary', assigned: true, weekMinutes: 90 },
      { id: 'p2', name: 'Diego', assigned: true, weekMinutes: 0 },
    ],
  })),
  setVisitStaff: (...a: unknown[]) => mockSetStaff(...a),
  fetchWeekPlan: (...a: unknown[]) => mockWeekPlan(...a),
  saveWeek: (...a: unknown[]) => mockSaveWeek(...a),
}));
const mockSchedule = jest.fn();
const mockSetStaff = jest.fn();
const mockWeekPlan = jest.fn();
const mockSaveWeek = jest.fn();
const mockShare = jest.fn();
jest.mock('@/lib/sharePdf', () => ({ sharePdf: (...a: unknown[]) => mockShare(...a), shareAvailable: () => false }));

import { ClockCard } from '@/components/work/ClockCard';
import WorkScreen from '@/app/(app)/schedule/work/[id]';
import ScheduleScreen from '@/app/(app)/schedule/index';

const visit = {
  id: 'v1',
  jobsite: 'Break TAX Office',
  address: '',
  day: '2026-10-26',
  startsAt: new Date(2026, 9, 26, 18, 0),
  minutes: 120,
  scheduled: true,
  entry: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
});

describe('ClockCard (D-049 a D-051, D-214)', () => {
  it('lejos del sitio muestra la distancia y deja marcar de todos modos', async () => {
    mockPosition.mockResolvedValue({ latitude: 26.1, longitude: -81.8, accuracy: 10 });
    mockCheck.mockResolvedValue({ ok: true, data: { status: 'out_of_range', distanceM: 400 } });
    mockClockIn.mockResolvedValue({ ok: true, data: { id: 'w1' } });
    await render(<ClockCard visit={visit} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Desliza para marcar entrada'));
    expect(await screen.findByText('Estás a 400 m del sitio')).toBeTruthy();
    expect(mockClockIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Marcar de todos modos'));
    await waitFor(() => expect(mockClockIn).toHaveBeenCalledWith(expect.objectContaining({ visitId: 'v1', lat: 26.1, lng: -81.8 })));
    expect(await screen.findByText('Marcar salida')).toBeTruthy();
  });

  it('D-277 (2): sin ubicación no marca; explica por qué y da el botón para el permiso', async () => {
    mockPosition.mockResolvedValue(null);
    await render(<ClockCard visit={visit} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Desliza para marcar entrada'));
    expect(await screen.findByText(/necesitamos tu ubicación/)).toBeTruthy();
    expect(screen.getByText('Dar permiso de ubicación')).toBeTruthy();
    expect(mockClockIn).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    mockPosition.mockResolvedValue({ latitude: 26.14, longitude: -81.79, accuracy: 5 });
    mockCheck.mockResolvedValue({ ok: true, data: { status: 'ok', distanceM: 10 } });
    mockClockIn.mockResolvedValue({ ok: true, data: { id: 'w1' } });
    await fireEvent.press(screen.getByText('Volver a intentar'));
    await waitFor(() => expect(mockClockIn).toHaveBeenCalledWith(expect.objectContaining({ lat: 26.14, lng: -81.79 })));
  });

  it('con ubicación y sin internet guarda en el teléfono y abre el turno', async () => {
    mockPosition.mockResolvedValue({ latitude: 26.14, longitude: -81.79, accuracy: 5 });
    mockCheck.mockResolvedValue({ ok: false, reason: 'network' });
    mockClockIn.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<ClockCard visit={visit} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Desliza para marcar entrada'));
    expect(await screen.findByText('Sin conexión: se guardó en el teléfono y se enviará después.')).toBeTruthy();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'in', visitId: 'v1', lat: 26.14, lng: -81.79 }));
    expect(screen.getByText('Marcar salida')).toBeTruthy();
  });
});

describe('To approve por visita (D-266, D-262)', () => {
  const row = (o: Record<string, unknown>) => ({
    entryId: null,
    clockIn: null,
    clockOut: null,
    inStatus: null,
    outStatus: null,
    status: 'ok',
    distanceM: null,
    offline: false,
    unscheduled: false,
    manual: false,
    gpsPending: false,
    gpsReviewed: false,
    hasAppAccess: true,
    hasPay: true,
    ...o,
  });
  const card = (o: Record<string, unknown> = {}) => ({
    id: 'v1',
    jobsiteId: 'j1',
    jobsite: 'Cuenta X',
    client: 'Cuenta X',
    day: '2026-10-26',
    startsAt: new Date(2026, 9, 26, 23, 0),
    minutes: 240,
    approved: false,
    ended: true,
    urgent: false,
    noShow: [],
    rows: [
      row({ profileId: 'p1', name: 'Humbe', entryId: 'e1', clockIn: new Date(2026, 9, 26, 23, 0), clockOut: new Date(2026, 9, 27, 3, 0), inStatus: 'ok', outStatus: 'ok' }),
      row({ profileId: 'p2', name: 'Estela', entryId: 'e2', clockIn: new Date(2026, 9, 26, 23, 0), clockOut: new Date(2026, 9, 27, 3, 0), inStatus: 'auto', outStatus: 'auto', status: 'auto', hasAppAccess: false }),
      row({ profileId: 'p3', name: 'Ida', status: 'missing' }),
      row({ profileId: 'p4', name: 'Maria', entryId: 'e4', clockIn: new Date(2026, 9, 26, 23, 0), clockOut: new Date(2026, 9, 27, 3, 0), status: 'auto', hasAppAccess: false, hasPay: false }),
    ],
    ...o,
  });

  it('una tarjeta "Cuenta · fecha" con automático, missing y el aviso sin pago; Approve con missing no aprueba', async () => {
    mockVisitWork.mockResolvedValue({ ok: true, data: card() });
    mockApprove.mockResolvedValue({ ok: false, reason: 'missing_time' });
    await render(<WorkScreen />);
    expect(await screen.findByText('Cuenta X · Lun 26 oct')).toBeTruthy();
    expect(screen.getAllByText('Automático · sin acceso a la app')).toHaveLength(2);
    expect(screen.getByText('Falta clock in')).toBeTruthy();
    expect(screen.getByText('missing – missing')).toBeTruthy();
    expect(screen.getAllByText('11:00 PM – 3:00 AM · 4 h')).toHaveLength(3);
    expect(screen.getByText('Sin pago asignado para este día')).toBeTruthy();
    expect(screen.getAllByText('Edit')).toHaveLength(4);
    await fireEvent.press(screen.getByText('Approve'));
    expect(await screen.findByText('Falta la hora de alguien: regístrala con Edit o marca No show.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('No show pide confirmación y quita a la persona', async () => {
    mockVisitWork.mockResolvedValue({ ok: true, data: card() });
    mockNoShow.mockResolvedValue({ ok: true, data: null });
    await render(<WorkScreen />);
    await fireEvent.press(await screen.findByLabelText('No show Ida'));
    expect(screen.getByText('¿No show de Ida?')).toBeTruthy();
    const buttons = screen.getAllByText('No show');
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockNoShow).toHaveBeenCalledWith('v1', 'p3'));
  });

  it('+ Agregar persona registra a cualquier empleado activo (sustituto)', async () => {
    mockVisitWork.mockResolvedValue({ ok: true, data: card() });
    mockRecord.mockResolvedValue({ ok: true, data: null });
    await render(<WorkScreen />);
    await fireEvent.press(await screen.findByText('+ Agregar persona'));
    await fireEvent.press(await screen.findByText('Sustituto'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('v1', [expect.objectContaining({ profileId: 'p9' })]));
  });

  it('visita aprobada: el Super Admin sigue con Edit, No show y Agregar persona; otro admin no (D-262)', async () => {
    mockVisitWork.mockResolvedValue({ ok: true, data: card({ approved: true }) });
    await render(<WorkScreen />);
    expect(await screen.findByText('+ Agregar persona')).toBeTruthy();
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0);
    expect(screen.queryByText('Approve')).toBeNull();
    mockAccess = { isSuperAdmin: false, permissions: new Set(['work_aprobar', 'work_editar', 'work_registrar_por_otros']) };
    await screen.unmount();
    await render(<WorkScreen />);
    expect(await screen.findByText('Aprobado')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('No show')).toBeNull();
    expect(screen.queryByText('+ Agregar persona')).toBeNull();
  });
});

describe('Schedule: Detallado (D-231, D-235)', () => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const visits = [
    {
      id: 'v1',
      jobsiteId: 'j1',
      jobsite: 'Break TAX Office',
      client: 'Break TAX',
      day: key,
      startsAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0),
      minutes: 90,
      generated: true,
      approved: false,
      worked: false,
      staff: [{ id: 'p1', name: 'Rosemary', weekMinutes: 90 }],
    },
  ];

  it('Detallado: solo la tabla Empleado → días, por semana o por mes, con Compartir (D-235)', async () => {
    mockSchedule.mockResolvedValue({ ok: true, data: visits });
    mockShare.mockResolvedValue('unavailable');
    await render(<ScheduleScreen />);
    await fireEvent.press(await screen.findByText('Detallado'));
    expect(await screen.findByText('Rosemary')).toBeTruthy();
    expect(screen.getByText('Break TAX O…')).toBeTruthy();
    // La semana empieza en domingo (D-231): la primera columna es D.
    expect(screen.getByText(/^D \d+$/)).toBeTruthy();
    expect(screen.queryByText('Lista')).toBeNull();
    expect(screen.queryByText('Calendario')).toBeNull();
    expect(screen.queryByText('Día → empleados')).toBeNull();
    await fireEvent.press(screen.getByText('Compartir'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(String(mockShare.mock.calls[0][0])).toContain('Rosemary');
    expect(await screen.findByText('Compartir llega con la versión 1.3.0 de la app.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mes'));
    // El mes va del 1 al último día.
    expect(await screen.findByText(/ 1$/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Break TAX O…'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/schedule/visit/[id]', params: { id: 'v1', day: key } });
  });
});

describe('Schedule simple (D-232)', () => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const base = {
    jobsiteId: 'j1',
    client: 'Break TAX',
    day: key,
    startsAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0),
    minutes: 180,
    generated: false,
    approved: false,
    worked: false,
  };

  it('muestra hoy con sus jobsites y personas, y cambia quién va ese día', async () => {
    mockSchedule.mockResolvedValue({
      ok: true,
      data: [
        { ...base, id: 'v1', jobsite: 'Break TAX Office', staff: [{ id: 'p1', name: 'Rosemary' }] },
        { ...base, id: 'v2', jobsite: 'Naples Yacht Club', staff: [] },
      ],
    });
    mockSetStaff.mockResolvedValue({ ok: true, data: [] });
    await render(<ScheduleScreen />);
    expect(await screen.findByText(/^Hoy · /)).toBeTruthy();
    expect(screen.getByText('2 jobsites')).toBeTruthy();
    expect(screen.getAllByText('6:00 PM · 3 h')).toHaveLength(2);
    expect(screen.getByText('Rosemary')).toBeTruthy();
    expect(screen.getByText('Falta asignar personal')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cambiar quién va a Naples Yacht Club'));
    await fireEvent.press(await screen.findByLabelText('Diego'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockSetStaff).toHaveBeenCalledWith('v2', ['p2']));
  });

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const twoDays = () =>
    mockSchedule.mockResolvedValue({
      ok: true,
      data: [
        { ...base, id: 'v1', jobsite: 'Break TAX Office', staff: [{ id: 'p1', name: 'Rosemary' }] },
        { ...base, id: 'v3', jobsite: 'Naples Yacht Club', day: tomorrowKey, startsAt: new Date(tomorrow.getTime() + 18 * 3600000), staff: [] },
      ],
    });

  it('D-254: la ventana de una visita de hoy lleva "Registrar trabajo", que abre su registro y cierra la ventana', async () => {
    twoDays();
    mockAccess = { isSuperAdmin: false, permissions: new Set(['schedule_ver_editar', 'work_registrar_por_otros']) };
    await render(<ScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText('Cambiar quién va a Break TAX Office'));
    await fireEvent.press(await screen.findByText('Registrar trabajo'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/schedule/work/[id]', params: { id: 'v1' } });
    await waitFor(() => expect(screen.queryByText('Registrar trabajo')).toBeNull());
  });

  it('D-254: sin "Registrar trabajo" en una visita de mañana ni sin el permiso', async () => {
    twoDays();
    mockAccess = { isSuperAdmin: false, permissions: new Set(['schedule_ver_editar', 'work_registrar_por_otros']) };
    await render(<ScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText('Cambiar quién va a Naples Yacht Club'));
    await screen.findByLabelText('Diego');
    expect(screen.queryByText('Registrar trabajo')).toBeNull();
    await fireEvent.press(screen.getByText('Cancelar'));

    mockAccess = { isSuperAdmin: false, permissions: new Set(['schedule_ver_editar']) };
    await render(<ScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText('Cambiar quién va a Break TAX Office'));
    await screen.findByLabelText('Diego');
    expect(screen.queryByText('Registrar trabajo')).toBeNull();
  });
});

describe('Schedule por semana (D-232)', () => {
  const site = (cells: string[][]) => ({
    id: 'j1',
    name: 'Break TAX Office',
    client: 'Break TAX',
    startTime: '18:00:00',
    minutes: 180,
    days: [1, 3],
    locked: [],
    cells,
    people: [{ id: 'p1', name: 'Rosemary', assigned: true }],
  });
  const empty = [[], [], [], [], [], [], []];

  it('una semana sin guardar se ve vacía; marcar, copiar la anterior y guardar', async () => {
    mockSchedule.mockResolvedValue({ ok: true, data: [] });
    mockWeekPlan.mockImplementation(async (sunday: string) => ({
      ok: true,
      data: { sunday, staff: [{ id: 'p1', name: 'Rosemary' }, { id: 'p2', name: 'Diego' }], jobsites: [site(empty)] },
    }));
    mockSaveWeek.mockResolvedValue({ ok: true, data: [] });
    await render(<ScheduleScreen />);
    await fireEvent.press((await screen.findAllByText('Semana'))[0]);
    expect(await screen.findByText('Esta semana todavía no está guardada: marca quién va y guarda.')).toBeTruthy();
    expect(screen.getByText('6:00 PM · 3 h · toca para marcar quién va cada día')).toBeTruthy();
    // Martes no se trabaja: no se puede marcar.
    expect(screen.getByLabelText('Break TAX Office no tiene visita el Mar')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Rosemary Lun'));
    await fireEvent.press(screen.getByText('Guardar semana'));
    await waitFor(() => expect(mockSaveWeek).toHaveBeenCalled());
    const [sunday, plan] = mockSaveWeek.mock.calls[0];
    expect(new Date(`${sunday}T12:00:00`).getDay()).toBe(0);
    expect(plan).toEqual([{ jobsite: 'j1', cells: [[], ['p1'], [], [], [], [], []] }]);

    // Copiar semana anterior: trae a Diego el miércoles (y lo suma a la cuadrícula).
    mockWeekPlan.mockImplementation(async (sun: string) => ({
      ok: true,
      data: {
        sunday: sun,
        staff: [{ id: 'p1', name: 'Rosemary' }, { id: 'p2', name: 'Diego' }],
        jobsites: [{ ...site([[], [], [], ['p2'], [], [], []]), people: [{ id: 'p2', name: 'Diego', assigned: false }] }],
      },
    }));
    await fireEvent.press(screen.getByText('Copiar semana anterior'));
    expect(await screen.findByLabelText('Diego Mié')).toBeTruthy();
  });
});
