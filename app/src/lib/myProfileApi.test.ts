jest.mock('./supabase', () => ({ supabase: {} }));
import { splitName, validateMyProfile } from './myProfileApi';

describe('Editar mi perfil (orden 152)', () => {
  it('nombre y apellido obligatorios; teléfono opcional pero de EE. UU. (D-216)', () => {
    expect(validateMyProfile({ firstName: 'Ana', lastName: 'Ruiz', phone: '' })).toBeNull();
    expect(validateMyProfile({ firstName: 'Ana', lastName: 'Ruiz', phone: '(786) 250-1324' })).toBeNull();
    expect(validateMyProfile({ firstName: ' ', lastName: 'Ruiz', phone: '' })).toBe('name');
    expect(validateMyProfile({ firstName: 'Ana', lastName: '', phone: '' })).toBe('name');
    expect(validateMyProfile({ firstName: 'Ana', lastName: 'Ruiz', phone: '(123) 456-7890' })).toBe('phone');
  });
  it('perfil viejo solo con nombre completo: se parte en la primera palabra', () => {
    expect(splitName('Humberto', 'Villiva', 'x')).toEqual({ firstName: 'Humberto', lastName: 'Villiva' });
    expect(splitName(null, null, 'Ana María Pérez')).toEqual({ firstName: 'Ana', lastName: 'María Pérez' });
    expect(splitName(null, null, '')).toEqual({ firstName: '', lastName: '' });
  });
});
