import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// Fase D (D-292, surveys/ica-ofertas-aprobado.html): oferta del 1099 y advertencias.
const mockRespond = jest.fn();
const mockMyOffers = jest.fn();
const mockWarnings = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/session', () => ({ useSession: () => ({ locale: 'es' }) }));
jest.mock('@/components/brand/DoneOverlay', () => ({ showDone: jest.fn() }));
jest.mock('@/lib/documents', () => ({ chooseFile: jest.fn() }));
jest.mock('@/lib/serviceDays', () => ({ completeServiceDay: jest.fn() }));
jest.mock('@/lib/icaApi', () => ({
  fetchMyOffers: () => mockMyOffers(),
  respondOffer: (id: string, a: boolean) => mockRespond(id, a),
  fetchWarnings: () => mockWarnings(),
  createWarning: jest.fn(),
  voidWarning: jest.fn(),
  hour12: (x: string | null) => (x === '23:00' ? '11:00 pm' : x === '03:00' ? '3:00 am' : ''),
}));

import { OfferCards } from '@/components/ica/OfferCard';
import { WarningsSection } from '@/components/ica/WarningsSection';

const offer = {
  id: 'o1', profileId: 'p', contractor: 'Karina', kind: 'jobsite', jobsiteId: 'j', jobsite: 'Naples Yacht Club', visitDate: null,
  startDate: '2026-11-01', windowStart: '23:00', windowEnd: '03:00', frequency: { kind: 'weekly', days: [0, 1, 3, 4, 5, 6] }, rate: 80,
  note: null, status: 'pending', offeredAt: '2026-10-31T12:00:00Z', respondedAt: null, responseSource: null,
};

describe('oferta del 1099', () => {
  it('muestra la oferta como la muestra y acepta', async () => {
    mockMyOffers.mockResolvedValue({ ok: true, data: [offer] });
    mockRespond.mockResolvedValue({ ok: true, data: { ...offer, status: 'accepted' } });
    await render(<OfferCards />);
    expect(await screen.findByText('Nueva oferta de trabajo')).toBeTruthy();
    expect(screen.getByText('Naples Yacht Club · Franja de acceso del cliente 11:00 pm – 3:00 am · 6 días por semana · $80 por día de servicio')).toBeTruthy();
    expect(screen.getByText('Puedes aceptar o rechazar sin ninguna consecuencia.')).toBeTruthy();
    mockMyOffers.mockResolvedValue({ ok: true, data: [] });
    await fireEvent.press(screen.getByText('Aceptar'));
    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith('o1', true));
  });
});

describe('advertencias', () => {
  it('contador "{n} de 3", Nueva advertencia para el Super Admin y aviso ámbar al llegar a 3', async () => {
    mockWarnings.mockResolvedValue({ ok: true, data: { activeCount: 3, canManage: true, items: [
      { id: 'w1', issuedOn: '2026-10-12', reason: 'No marcó el día', hasDocument: false, status: 'active', voidReason: null },
    ] } });
    await render(<WarningsSection profileId="p" fullName="Karina S" />);
    expect(await screen.findByText('3 de 3')).toBeTruthy();
    expect(screen.getByText('Nueva advertencia')).toBeTruthy();
    expect(screen.getByText('Anular')).toBeTruthy();
    expect(screen.getByText('Karina S tiene 3 advertencias escritas. Revisa si corresponde terminar el contrato por escrito.')).toBeTruthy();
  });

  it('sin permiso de gestión no se crea ni se anula', async () => {
    mockWarnings.mockResolvedValue({ ok: true, data: { activeCount: 1, canManage: false, items: [] } });
    await render(<WarningsSection profileId="p" fullName="Karina S" />);
    expect(await screen.findByText('1 de 3')).toBeTruthy();
    expect(screen.queryByText('Nueva advertencia')).toBeNull();
    expect(screen.getByText('Al llegar a 3 te avisamos para revisar si corresponde terminar el contrato por escrito.')).toBeTruthy();
  });
});
