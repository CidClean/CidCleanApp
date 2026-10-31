import { failureFrom } from './clientsApi';
import { workFailure } from './scheduleApi';

jest.mock('./supabase', () => ({ supabase: {} }));

// D-283: el servidor rechaza programar o asignar personal mientras el contrato no esté firmado por ambas partes.
describe('contrato pendiente', () => {
  it('el Schedule lo reconoce con el nombre del jobsite', () => {
    expect(workFailure('22023', 'contract_pending:Oficina norte')).toEqual({ reason: 'contract_pending', detail: 'Oficina norte' });
  });
  it('la asignación de personal lo reconoce', () => {
    expect(failureFrom('22023', 'contract_pending:Oficina')).toBe('contractPending');
    expect(failureFrom('22023', 'otra cosa')).toBe('invalid');
  });
});
