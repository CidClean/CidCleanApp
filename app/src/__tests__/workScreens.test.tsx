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
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: true, permissions: new Set() }, isSuperAdmin: true, can: () => true }),
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
  recordWork: jest.fn(),
  reviewGps: jest.fn(),
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

beforeEach(() => jest.clearAllMocks());

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

  it('sin ubicación y sin internet guarda en el teléfono y abre el turno', async () => {
    mockPosition.mockResolvedValue(null);
    mockClockIn.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<ClockCard visit={visit} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Desliza para marcar entrada'));
    expect(await screen.findByText('Sin conexión: se guardó en el teléfono y se enviará después.')).toBeTruthy();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'in', visitId: 'v1', lat: null, lng: null }));
    expect(screen.getByText('Marcar salida')).toBeTruthy();
  });
});

describe('Trabajo por aprobar (D-109)', () => {
  const work = {
    id: 'v1',
    jobsite: 'Break TAX Office',
    day: '2026-10-26',
    startsAt: new Date(2026, 9, 26, 18, 0),
    minutes: 120,
    approved: false,
    scheduled: [{ id: 'p1', name: 'Rosemary' }],
    entries: [
      {
        id: 'e1',
        profileId: 'p1',
        name: 'Rosemary',
        clockIn: new Date(2026, 9, 26, 18, 0),
        clockOut: new Date(2026, 9, 26, 20, 30),
        inStatus: 'out_of_range',
        outStatus: 'ok',
        distanceM: 320,
        gpsPending: true,
        gpsReviewed: false,
        offline: false,
        unscheduled: false,
        manual: false,
      },
    ],
  };

  it('muestra horas y fichas, y no aprueba con GPS sin revisar', async () => {
    mockVisitWork.mockResolvedValue({ ok: true, data: work });
    mockApprove.mockResolvedValue({ ok: false, reason: 'gps_pending' });
    await render(<WorkScreen />);
    expect(await screen.findByText('Rosemary')).toBeTruthy();
    expect(screen.getByText('GPS fuera de rango')).toBeTruthy();
    expect(screen.getByText('A 320 m del sitio')).toBeTruthy();
    await fireEvent.press(screen.getByText('Aprobar'));
    expect(await screen.findByText('Falta revisar el GPS fuera de rango.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('Schedule: Tabla y Calendario (D-231)', () => {
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

  it('alterna Lista, Tabla (dos sentidos, Compartir) y Calendario', async () => {
    mockSchedule.mockResolvedValue({ ok: true, data: visits });
    mockShare.mockResolvedValue('unavailable');
    await render(<ScheduleScreen />);
    await fireEvent.press(await screen.findByText('Detallado'));
    expect(await screen.findByText('6:00 PM · 1.5 h · Break TAX')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tabla'));
    expect(await screen.findByText('Rosemary')).toBeTruthy();
    expect(screen.getByText('Break TAX O…')).toBeTruthy();
    // La semana empieza en domingo (D-231): la primera columna es D.
    expect(screen.getByText(/^D \d+$/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Día → empleados'));
    expect(await screen.findByText('Rosemary → Break TAX Office · 6:00 PM')).toBeTruthy();
    await fireEvent.press(screen.getByText('Compartir'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(String(mockShare.mock.calls[0][0])).toContain('Rosemary');
    expect(await screen.findByText('Compartir llega con la versión 1.3.0 de la app.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Calendario'));
    await fireEvent.press(screen.getByText('Mes'));
    expect(await screen.findByText('Break…')).toBeTruthy();
    await fireEvent.press(screen.getByText('Break…'));
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
