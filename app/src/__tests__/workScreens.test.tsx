import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockBack = jest.fn();
const mockPosition = jest.fn();
const mockCheck = jest.fn();
const mockClockIn = jest.fn();
const mockEnqueue = jest.fn();
const mockVisitWork = jest.fn();
const mockApprove = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'v1' }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
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
}));

import { ClockCard } from '@/components/work/ClockCard';
import WorkScreen from '@/app/(app)/schedule/work/[id]';

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
