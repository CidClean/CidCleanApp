import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

// Formularios de dirección (D-301): un solo componente con Dirección, Dirección 2, State, City y ZIP code.
const mockCreateClient = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: true, permissions: new Set() }, isSuperAdmin: true, can: () => true }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/lib/clientsApi', () => ({ createLegacyClient: (...a: unknown[]) => mockCreateClient(...a) }));

import { AddressFields } from '@/components/AddressFields';
import { addressEs } from '@/i18n/address';
import { addressErrors, emptyAddress, type AddressParts } from '@/lib/address';
import NewClientScreen from '@/app/(app)/clients/new';

function Wrapper({ optional = false }: { optional?: boolean }) {
  const [form, setForm] = useState<AddressParts>(emptyAddress());
  return <AddressFields form={form} onChange={setForm} t={addressEs} errors={addressErrors(form, 'partial')} optional={optional} />;
}

beforeEach(() => {
  mockCreateClient.mockReset();
  mockReplace.mockReset();
});

describe('AddressFields (D-301)', () => {
  it('mismo orden y textos que el formulario del empleado; State parte en FL', async () => {
    await render(<Wrapper />);
    const labels = ['Dirección', 'Dirección 2', 'State', 'City', 'ZIP code'];
    for (const l of labels) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByText('Florida (FL)')).toBeTruthy();
  });

  it('ZIP de 5 dígitos o 5+4', async () => {
    await render(<Wrapper optional />);
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '3410');
    expect(screen.getByText(addressEs.errorZip)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '34108-1234');
    expect(screen.queryByText(addressEs.errorZip)).toBeNull();
  });
});

describe('Nuevo cliente con dirección (D-301)', () => {
  it('sin dirección se crea; con una dirección a medias pide completarla y la manda separada', async () => {
    mockCreateClient.mockResolvedValue({ ok: true, data: 'c9' });
    await render(<NewClientScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de la empresa'), 'Gulf Coast Dental');
    await fireEvent.changeText(screen.getByLabelText('Dirección'), '1250 Pine Ridge Rd');
    await fireEvent.press(screen.getByText('Crear cliente'));
    expect(screen.getByText(addressEs.errorCity)).toBeTruthy();
    expect(mockCreateClient).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Dirección 2'), 'Suite 202');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Naples');
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '34108');
    await fireEvent.press(screen.getByText('Crear cliente'));
    await waitFor(() => expect(mockCreateClient).toHaveBeenCalled());
    expect(mockCreateClient.mock.calls[0][0]).toMatchObject({
      name: 'Gulf Coast Dental', addressLine1: '1250 Pine Ridge Rd', addressLine2: 'Suite 202', city: 'Naples', state: 'FL', zip: '34108',
    });
  });

  it('sin ningún dato de dirección no la pide', async () => {
    mockCreateClient.mockResolvedValue({ ok: true, data: 'c9' });
    await render(<NewClientScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de la empresa'), 'Cero');
    await fireEvent.press(screen.getByText('Crear cliente'));
    await waitFor(() => expect(mockCreateClient).toHaveBeenCalled());
  });
});
