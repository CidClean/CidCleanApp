import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
}));
jest.mock('@/lib/employeesApi', () => ({ fetchEmployees: async () => ({ ok: true, data: [] }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockSignOut = jest.fn();
const mockRefresh = jest.fn();
const mockSave = jest.fn();
// Orden 152: Editar mi perfil lee y guarda nombre, apellido y teléfono propios.
jest.mock('@/lib/myProfileApi', () => ({
  ...jest.requireActual('@/lib/myProfileApi'),
  fetchMyProfile: async () => ({ firstName: 'Ana', lastName: 'Ruiz', phone: '(239) 555-0142' }),
  saveMyProfile: (...a: unknown[]) => mockSave(...a),
}));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: false, permissions: new Set() }, isSuperAdmin: false, can: () => false }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo', fullName: 'Ana', email: 'ana@x.com' }, setLanguage: jest.fn(), signOut: mockSignOut, refresh: mockRefresh }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));

import AccountScreen from '@/app/(app)/account';
import ProfileScreen from '@/app/(app)/profile';
import { getThemePreference, resetThemePreferenceForTests } from '@/lib/themePreference';
import { palettes, useTheme } from '@/theme';

function Probe() {
  const { colors, scheme } = useTheme();
  return <Text testID="probe">{`${scheme} ${colors.background}`}</Text>;
}

beforeEach(() => {
  resetThemePreferenceForTests('system');
  mockSignOut.mockReset();
});

describe('Cerrar sesión (D-222 a)', () => {
  it('al final de Mi cuenta (D-337), con la ventana al centro; Cancelar no cierra la sesión', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByText('Cerrar sesión'));
    expect(screen.getByText('¿Cerrar sesión?')).toBeTruthy();
    expect(screen.getByText('Tendrás que pedir un código para volver a entrar.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.queryByText('¿Cerrar sesión?')).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cerrar sesión'));
    await fireEvent.press(screen.getAllByText('Cerrar sesión').slice(-1)[0]);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('en Mi perfil abre la misma ventana sin cambiar la pantalla', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Cerrar sesión'));
    expect(screen.getByText('¿Cerrar sesión?')).toBeTruthy();
    expect(screen.getByText('Idioma')).toBeTruthy();
  });
});

describe('Mi cuenta (D-337 (4))', () => {
  it('cabecera con nombre, rol y correo; Me con sus filas; sin Company settings si no es Super Admin', async () => {
    await render(<AccountScreen />);
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText(/ana@x\.com/)).toBeTruthy();
    expect(screen.getByText('Editar mi perfil')).toBeTruthy();
    expect(screen.getByText('Idioma · Tema')).toBeTruthy();
    expect(screen.getByText('Mis notificaciones')).toBeTruthy();
    expect(screen.queryByText('AJUSTES DE LA EMPRESA')).toBeNull();
    expect(screen.queryByText('Términos y privacidad')).toBeNull();
  });

  it('Idioma · Tema abre la ventana con el tema', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByText('Idioma · Tema'));
    await fireEvent.press(screen.getByText('Oscuro'));
    expect(getThemePreference()).toBe('dark');
  });
});

describe('Tema (D-222 b)', () => {
  it('Sistema por defecto; elegir Oscuro cambia la paleta al instante en toda la app', async () => {
    await render(
      <>
        <ProfileScreen />
        <Probe />
      </>,
    );
    expect(screen.getByText('Sistema')).toBeTruthy();
    expect(screen.getByTestId('probe').props.children).toBe(`light ${palettes.light.background}`);
    await fireEvent.press(screen.getByText('Tema'));
    await fireEvent.press(screen.getByText('Oscuro'));
    expect(getThemePreference()).toBe('dark');
    expect(screen.getByTestId('probe').props.children).toBe(`dark ${palettes.dark.background}`);
    expect(screen.getByText('Oscuro')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tema'));
    await fireEvent.press(screen.getByText('Claro'));
    expect(screen.getByTestId('probe').props.children).toBe(`light ${palettes.light.background}`);
  });

  it('se recuerda en el teléfono', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Tema'));
    await fireEvent.press(screen.getByText('Oscuro'));
    await waitFor(async () => expect(await AsyncStorage.getItem('cidclean-theme')).toBe('dark'));
  });
});

describe('Editar mi perfil (orden 152, D-340 (3))', () => {
  beforeEach(() => {
    mockSave.mockReset();
    mockRefresh.mockReset();
  });

  it('nombre, apellido y teléfono editables; el correo de entrada solo se muestra; guarda y refresca la sesión', async () => {
    mockSave.mockResolvedValue('ok');
    await render(<ProfileScreen />);
    expect(screen.getByText('Editar mi perfil')).toBeTruthy();
    expect(await screen.findByDisplayValue('Ana')).toBeTruthy();
    expect(screen.getByDisplayValue('Ruiz')).toBeTruthy();
    expect(screen.getByText('ana@x.com · correo de entrada')).toBeTruthy();
    expect(screen.queryByDisplayValue('ana@x.com')).toBeNull();
    expect(screen.getByText('Tu nombre y teléfono van en la firma de los correos que envías con plantillas.')).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('(239) 555-0142'), '7862501324');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ firstName: 'Ana', lastName: 'Ruiz', phone: '(786) 250-1324' }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.getByText('Guardado.')).toBeTruthy();
  });

  it('teléfono inválido o sin apellido no guarda', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByDisplayValue('(239) 555-0142'), '1234567890');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getByText(/Escribe un teléfono válido de EE\. UU\./)).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('Ruiz'), ' ');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getAllByText('Escribe tu nombre y apellido.').length).toBeGreaterThan(0);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
