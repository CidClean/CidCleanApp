jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));

import { workFailure } from './scheduleApi';

describe('errores de los días de servicio y la ubicación (D-275, D-277)', () => {
  it('reconoce los códigos nuevos del servidor', () => {
    expect(workFailure('22023', 'location_required').reason).toBe('location_required');
    expect(workFailure('42501', 'contractor_no_hours').reason).toBe('contractor_no_hours');
    expect(workFailure('22023', 'service_days_pending').reason).toBe('service_days_pending');
    expect(workFailure('22023', 'note_required').reason).toBe('note_required');
    expect(workFailure('22023', 'already_approved').reason).toBe('already_approved');
    expect(workFailure('42501', 'otra cosa').reason).toBe('forbidden');
  });
});
