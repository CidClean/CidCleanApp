import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockSignOut = jest.fn();
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: false, permissions: new Set() }, isSuperAdmin: false, can: () => false }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo', fullName: 'Ana', email: 'ana@x.com' }, setLanguage: jest.fn(), signOut: mockSignOut }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));

import MenuScreen from '@/app/(app)/(tabs)/menu';
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
  it('al final del Menú, con la ventana al centro; Cancelar no cierra la sesión', async () => {
    await render(<MenuScreen />);
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
