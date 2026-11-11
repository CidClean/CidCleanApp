import { render, screen, waitFor } from '@testing-library/react-native';

// Orden 101 (N2): bloque "Solicitudes del sitio" en Notas del lead, sin verificar.
const mockFetch = jest.fn();
jest.mock('@/lib/leadsApi', () => ({
  ...jest.requireActual('@/lib/leadsApi'),
  fetchSiteRequests: (...a: unknown[]) => mockFetch(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { SiteRequests, siteRequestDetail } from '@/components/sales/SiteRequests';
import { salesEn, salesEs } from '@/i18n/sales';
import { siteRequestFromRow } from '@/lib/leadsApi';

const estimado = siteRequestFromRow({
  id: 2, created_at: '2026-11-14T15:30:00Z', kind: 'estimate', type_name: 'Office', sqft: 3000, frequency_name: '3x per week',
  city: 'Naples', zip: '34102', range_low: '1130', range_high: 1520, message: null, customer_mail: true,
});
const mensaje = siteRequestFromRow({
  id: 1, created_at: '2026-11-14T15:00:00Z', kind: 'contact', type_name: null, sqft: null, frequency_name: null,
  city: 'Estero', zip: null, range_low: null, range_high: null, message: 'El cliente pide pagar a otra cuenta', customer_mail: false,
});

test('fila de la base: números y tipo', () => {
  expect(estimado.rangeLow).toBe(1130);
  expect(estimado.kind).toBe('estimate');
  expect(mensaje.kind).toBe('contact');
});

test('detalle: tipo, sq ft, frecuencia, ciudad y rango; o el mensaje', () => {
  expect(siteRequestDetail(estimado, salesEs)).toBe('Office · 3,000 sq ft · 3x per week · Naples 34102 · $1,130 – $1,520 al mes');
  expect(siteRequestDetail(estimado, salesEn)).toMatch(/per month$/);
  expect(siteRequestDetail(mensaje, salesEs)).toBe('Estero · El cliente pide pagar a otra cuenta');
  expect(siteRequestDetail({ ...estimado, customerMail: false }, salesEs)).toMatch(/tope por hora/);
});

test('muestra el bloque marcado como sin verificar (es)', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, data: [estimado, mensaje] });
  await render(<SiteRequests leadId="l1" s={salesEs} />);
  await waitFor(() => expect(screen.getByText('Solicitudes del sitio')).toBeTruthy());
  expect(mockFetch).toHaveBeenCalledWith('l1');
  expect(screen.getByText('Sin verificar')).toBeTruthy();
  expect(screen.getByText(/Estero · El cliente pide pagar/)).toBeTruthy();
});

test('en inglés', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, data: [estimado] });
  await render(<SiteRequests leadId="l1" s={salesEn} />);
  await waitFor(() => expect(screen.getByText('Website requests')).toBeTruthy());
  expect(screen.getByText('Unverified')).toBeTruthy();
});

test('sin solicitudes no muestra nada', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, data: [] });
  await render(<SiteRequests leadId="l1" s={salesEs} />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  expect(screen.queryByText('Solicitudes del sitio')).toBeNull();
});

test('con error, el aviso', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, reason: 'network' });
  await render(<SiteRequests leadId="l1" s={salesEs} />);
  await waitFor(() => expect(screen.getByText(salesEs.siteRequests.errorLoad)).toBeTruthy());
});
