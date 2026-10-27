import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { id?: string } = {};
let mockIsSuperAdmin = true;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: { isSuperAdmin: mockIsSuperAdmin, permissions: new Set(['gastos_ver']) },
    isSuperAdmin: mockIsSuperAdmin,
    can: () => mockIsSuperAdmin,
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockFetch = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/accountingApi', () => ({
  fetchExpenseCategories: (...a: unknown[]) => mockFetch(...a),
  createExpenseCategory: (...a: unknown[]) => mockCreate(...a),
  updateExpenseCategory: (...a: unknown[]) => mockUpdate(...a),
  removeExpenseCategory: (...a: unknown[]) => mockRemove(...a),
}));

import { ExpenseCategoriesSettingsRow } from '@/components/accounting/ExpenseCategoriesSettingsRow';
import ExpenseCategoryFormScreen from '@/app/(app)/settings/expense-categories/edit';
import ExpenseCategoriesScreen from '@/app/(app)/settings/expense-categories/index';

const categories = [
  { id: 'c1', labelEs: 'Suministros', labelEn: 'Supplies', sort: 1, active: true },
  { id: 'c2', labelEs: 'Equipo', labelEn: 'Equipment', sort: 2, active: true },
  { id: 'c9', labelEs: 'Vieja', labelEn: 'Old', sort: 9, active: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockIsSuperAdmin = true;
  mockFetch.mockResolvedValue({ ok: true, data: categories });
});

describe('Ajustes → Categorías de gastos (D-113, D-114, D-130, D-254)', () => {
  it('la fila de Ajustes muestra la cantidad de categorías activas y abre la pantalla', async () => {
    await render(<ExpenseCategoriesSettingsRow />);
    expect(await screen.findByText('2 categorías')).toBeTruthy();
    await fireEvent.press(screen.getByText('Categorías de gastos'));
    expect(mockPush).toHaveBeenCalledWith('/settings/expense-categories');
  });

  it('solo el Super Admin', async () => {
    mockIsSuperAdmin = false;
    await render(<ExpenseCategoriesScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
    await render(<ExpenseCategoryFormScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });

  it('lista las activas con el otro idioma en gris; la papelera confirma en ventana y una usada se desactiva con aviso', async () => {
    mockRemove.mockResolvedValue({ ok: true, data: 'deactivated' });
    await render(<ExpenseCategoriesScreen />);
    expect(await screen.findByText('Suministros')).toBeTruthy();
    expect(screen.getByText('Supplies')).toBeTruthy();
    expect(screen.queryByText('Vieja')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Eliminar Suministros'));
    expect(screen.getByText('¿Eliminar Suministros?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eliminar'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Algún gasto ya usa esta categoría: se quitó de la lista y esos gastos la conservan.')).toBeTruthy();
  });

  it('si la papelera falla lo dice', async () => {
    mockRemove.mockResolvedValue({ ok: false, reason: 'server' });
    await render(<ExpenseCategoriesScreen />);
    await fireEvent.press(await screen.findByLabelText('Eliminar Equipo'));
    await fireEvent.press(screen.getByText('Eliminar'));
    expect(await screen.findByText('No se pudo eliminar la categoría. Inténtalo otra vez.')).toBeTruthy();
  });

  it('Agregar abre el formulario; pide los dos idiomas y la pone al final', async () => {
    mockCreate.mockResolvedValue({ ok: true, data: 'c10' });
    await render(<ExpenseCategoriesScreen />);
    await screen.findByText('Suministros');
    await fireEvent.press(screen.getByText('Agregar'));
    expect(mockPush).toHaveBeenCalledWith('/settings/expense-categories/edit');

    await render(<ExpenseCategoryFormScreen />);
    expect(screen.getByText('Nueva categoría')).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByLabelText('En español'), 'Comida');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getByText('Escribe la categoría en inglés.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('En inglés'), 'Food');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('Comida', 'Food', 10));
    expect(mockBack).toHaveBeenCalled();
  });

  it('el lápiz abre la categoría y la edita', async () => {
    await render(<ExpenseCategoriesScreen />);
    await fireEvent.press(await screen.findByLabelText('Editar Equipo'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/settings/expense-categories/edit', params: { id: 'c2' } });

    mockParams = { id: 'c2' };
    mockUpdate.mockResolvedValue({ ok: true, data: null });
    await render(<ExpenseCategoryFormScreen />);
    expect(await screen.findByDisplayValue('Equipo')).toBeTruthy();
    expect(screen.getByText('Editar categoría')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('En inglés'), 'Tools');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c2', 'Equipo', 'Tools'));
  });
});
