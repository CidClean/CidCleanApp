import { getContractStrings, CONTRACT_PORTAL } from '@/i18n/contract';
import { contractStep, fieldsToShow, infoFromRow } from './contractApi';

jest.mock('./supabase', () => ({ supabase: {} }));

const row = (status: string, contract: Record<string, unknown> | null = null) =>
  infoFromRow({ jobsite_id: 'j', jobsite: 'HQ', company: 'Naples Yacht Club', status, accepted_at: '2026-10-30T14:00:00Z',
    sign_until: '2026-11-14T14:00:00Z', accepted_by: 'Ana Ruiz', accepted_title: 'Office Manager', quote_number: 'Q-0012',
    quote_version: '1.1', can_manage: true, contract });

describe('contrato del cliente (D-289)', () => {
  it('línea de pasos', () => {
    expect(contractStep(row('pending'))).toBe(1);
    expect(contractStep(row('pending', { id: 'c', csa: 'CSA-0007', status: 'sent' }))).toBe(2);
    expect(contractStep(row('client_signed', { id: 'c', csa: 'CSA-0007', status: 'client_signed' }))).toBe(3);
    expect(contractStep(row('both_signed'))).toBe(4);
    expect(contractStep(row('needs_update'))).toBe(1);
  });
  it('Preparar contrato: fecha de inicio, área y franja primero, luego los demás vacíos', () => {
    expect(fieldsToShow({ missing: ['effective_date', 'area_sqft', 'client_entity'] })).toEqual(
      ['start_date', 'area_sqft', 'service_window', 'effective_date', 'client_entity']);
  });
  it('mapea la ficha', () => {
    const i = row('pending', { id: 'c', csa: 'CSA-0007', status: 'sent', email: 'ana@x.com', sent_at: '2026-10-31T10:00:00Z' });
    expect(i.contract?.csa).toBe('CSA-0007');
    expect(i.canManage).toBe(true);
    expect(i.acceptedBy).toBe('Ana Ruiz');
  });
  it('textos aprobados y mismas llaves en es y en', () => {
    const es = getContractStrings('es');
    const en = getContractStrings('en');
    expect(es.priceHeld('Nov 14')).toBe('El precio se mantiene hasta Nov 14 (15 días). Después pasa a "Requiere actualización".');
    expect(es.copySent('Ana Ruiz')).toBe('Copia enviada a Ana Ruiz y a info@cidclean.com.');
    expect(es.residentialNote).toBe('Residencial no lleva el 6% de Florida.');
    expect(Object.keys(en.fields).sort()).toEqual(Object.keys(es.fields).sort());
    expect(CONTRACT_PORTAL.readPdf).toBe('Read the agreement and SOW (PDF)');
    expect(CONTRACT_PORTAL.sign).toBe('Sign agreement');
  });
});
