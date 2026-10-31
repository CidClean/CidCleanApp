import { rowToClient, rowToJobsite } from './clientsApi';
import { groupByClient, isDirectJobsite } from './clientRules';

jest.mock('./supabase', () => ({ supabase: {} }));

// D-291: clientes proveedores de cuentas. Sus jobsites se manejan directo (alta a mano y tarifa), como los previos.
describe('proveedor de cuentas', () => {
  const fila = {
    id: 'j', client_id: 'c', name: 'Sitio', address: '1 Main St', plus_code: null, contact_name: null, contact_phone: null,
    contact_email: null, emergency_name: null, emergency_phone: null, emergency_relation: null, emergency_email: null,
    frequency: null, est_hours_per_visit: null, visits_per_month: null, start_date: null, status: 'active' as const,
    walkthrough_version: null, clients: { name: 'Wilson Franquicia', legacy: false, account_provider: true },
  };

  it('lee la marca del cliente y del jobsite', () => {
    expect(rowToClient({ id: 'c', name: 'W', legacy: false, account_provider: true, phone: null, email: null, address: null, notes: null }).accountProvider).toBe(true);
    expect(rowToJobsite(fila).clientAccountProvider).toBe(true);
  });

  it('el jobsite de un proveedor se maneja directo, como el de un cliente previo', () => {
    const j = rowToJobsite(fila);
    expect(isDirectJobsite(j)).toBe(true);
    expect(isDirectJobsite({ clientLegacy: false, clientAccountProvider: false })).toBe(false);
    expect(isDirectJobsite({ clientLegacy: true })).toBe(true);
  });

  it('la lista de clientes lleva la marca del grupo', () => {
    expect(groupByClient([rowToJobsite(fila)])[0].accountProvider).toBe(true);
  });
});
