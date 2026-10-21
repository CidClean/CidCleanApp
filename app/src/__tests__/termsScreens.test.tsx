import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getStrings } from '@/i18n';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockPush = jest.fn();
let mockIsSuperAdmin = true;
let mockTermsOffline = false;
const mockRefresh = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: mockIsSuperAdmin, permissions: new Set() }, isSuperAdmin: mockIsSuperAdmin, can: () => mockIsSuperAdmin }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' }, termsOffline: mockTermsOffline, refresh: mockRefresh }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockFetchCurrent = jest.fn();
const mockPublish = jest.fn();
const mockChoosePdf = jest.fn();
jest.mock('@/lib/termsApi', () => ({
  fetchCurrentTerms: (...a: unknown[]) => mockFetchCurrent(...a),
  publishTerms: (...a: unknown[]) => mockPublish(...a),
  choosePdf: (...a: unknown[]) => mockChoosePdf(...a),
}));

import SettingsScreen from '@/app/(app)/settings/index';
import PublishTermsScreen from '@/app/(app)/settings/terms';
import TermsScreen from '@/app/(terms)/index';

const es = getStrings('es');
const v2 = { version: 2, publishedAt: new Date(2026, 9, 5, 12).toISOString(), filePath: 'staff/abc.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperAdmin = true;
  mockTermsOffline = false;
  mockFetchCurrent.mockResolvedValue({ ok: true, data: v2 });
});

describe('Menú → Ajustes (D-107, D-114, D-187)', () => {
  test('la fila "Términos del staff" con la versión vigente como valor y flecha; el título lleva la flecha de volver', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(es.nav.settings)).toBeTruthy();
    expect(screen.getByLabelText(es.common.back)).toBeTruthy();
    expect(screen.getByText(es.settings.termsRow)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('v2')).toBeTruthy());
    // Dos filas: Términos del staff y Transferir rol de Super Admin (orden 12).
    expect(screen.getAllByRole('button').filter((b) => b.props.accessibilityLabel !== es.common.back)).toHaveLength(2);
    expect(screen.getByText(es.transfer.row)).toBeTruthy();
  });

  test('sin versión publicada el valor es "Sin publicar"', async () => {
    mockFetchCurrent.mockResolvedValue({ ok: true, data: null });
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText(es.settings.unpublished)).toBeTruthy());
  });

  test('al tocar la fila se abre la pantalla de publicar', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText(es.settings.termsRow));
    expect(mockPush).toHaveBeenCalledWith('/settings/terms');
  });

  test('si no se puede leer la versión avisa con el texto de D-178', async () => {
    mockFetchCurrent.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText(es.terms.errorLoad)).toBeTruthy());
  });

  test('solo el Super Admin: quien no lo es vuelve a Inicio', async () => {
    mockIsSuperAdmin = false;
    await render(<SettingsScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
    expect(screen.queryByText(es.settings.termsRow)).toBeNull();
  });
});

describe('Términos del staff: publicar (D-176)', () => {
  test('muestra versión vigente y fecha, "Subir PDF", el aviso ámbar y el botón sólido (apagado hasta elegir un PDF)', async () => {
    await render(<PublishTermsScreen />);
    expect(screen.getByLabelText(es.common.back)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(es.settings.currentVersion(2, '5 oct 2026'))).toBeTruthy());
    expect(screen.getByText(es.settings.uploadPdf)).toBeTruthy();
    expect(screen.getByText(es.settings.acceptAgain)).toBeTruthy();
    expect(screen.getByText(es.settings.publish)).toBeTruthy();
    expect(screen.getByRole('button', { name: es.settings.publish }).props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByText(es.settings.publish));
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test('elegir un PDF muestra su nombre y activa Publicar nueva versión', async () => {
    mockChoosePdf.mockResolvedValue({ kind: 'picked', file: { uri: 'file:///a.pdf', name: 'terminos-staff-v3.pdf' } });
    await render(<PublishTermsScreen />);
    await fireEvent.press(screen.getByLabelText(es.settings.uploadPdf));
    await waitFor(() => expect(screen.getByText('terminos-staff-v3.pdf')).toBeTruthy());
    expect(screen.getByRole('button', { name: es.settings.publish }).props.accessibilityState).toEqual({ disabled: false });
  });

  test('publicar sube el PDF elegido, muestra la versión nueva y limpia el archivo', async () => {
    mockChoosePdf.mockResolvedValue({ kind: 'picked', file: { uri: 'file:///a.pdf', name: 'terminos-staff-v3.pdf' } });
    mockPublish.mockResolvedValue({ ok: true, data: null });
    await render(<PublishTermsScreen />);
    await fireEvent.press(screen.getByLabelText(es.settings.uploadPdf));
    await waitFor(() => screen.getByText('terminos-staff-v3.pdf'));
    mockFetchCurrent.mockResolvedValue({ ok: true, data: { ...v2, version: 3 } });
    await fireEvent.press(screen.getByText(es.settings.publish));
    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith({ uri: 'file:///a.pdf', name: 'terminos-staff-v3.pdf' }));
    await waitFor(() => expect(screen.getByText(es.settings.currentVersion(3, '5 oct 2026'))).toBeTruthy());
    expect(screen.queryByText('terminos-staff-v3.pdf')).toBeNull();
  });

  test('si falla la publicación muestra el aviso rojo y conserva el archivo', async () => {
    mockChoosePdf.mockResolvedValue({ kind: 'picked', file: { uri: 'file:///a.pdf', name: 'terminos-staff-v3.pdf' } });
    mockPublish.mockResolvedValue({ ok: false, reason: 'forbidden' });
    await render(<PublishTermsScreen />);
    await fireEvent.press(screen.getByLabelText(es.settings.uploadPdf));
    await waitFor(() => screen.getByText('terminos-staff-v3.pdf'));
    await fireEvent.press(screen.getByText(es.settings.publish));
    await waitFor(() => expect(screen.getByText(es.settings.errorPublish)).toBeTruthy());
    expect(screen.getByText('terminos-staff-v3.pdf')).toBeTruthy();
  });

  test('sin versión publicada la línea dice "Sin publicar"; quien no es Super Admin vuelve a Inicio', async () => {
    mockFetchCurrent.mockResolvedValue({ ok: true, data: null });
    await render(<PublishTermsScreen />);
    expect(screen.getByText(es.settings.unpublished)).toBeTruthy();
    mockIsSuperAdmin = false;
    await render(<PublishTermsScreen />);
    expect(screen.getAllByText('REDIRECT /').length).toBeGreaterThan(0);
  });
});

describe('Staff: Antes de empezar (D-086, D-176, D-179)', () => {
  test('"Leer los términos completos" abre el visor de PDF de la app con el nombre del documento (D-196)', async () => {
    await render(<TermsScreen />);
    await fireEvent.press(screen.getByText(es.terms.readFull));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/viewer', params: { source: 'terms', title: es.settings.termsRow } });
  });

  test('con conexión muestra los tres puntos, la casilla y Aceptar; no la pantalla de conexión', async () => {
    await render(<TermsScreen />);
    expect(screen.getByText(es.terms.accept)).toBeTruthy();
    expect(screen.getByText(es.terms.checkbox)).toBeTruthy();
    expect(screen.queryByText(es.terms.offlineTitle)).toBeNull();
  });

  test('sin conexión para revisar los términos: "Necesitas conexión para continuar", sin casilla ni Aceptar (D-179)', async () => {
    mockTermsOffline = true;
    await render(<TermsScreen />);
    expect(screen.getByText(es.terms.barTitle)).toBeTruthy();
    expect(screen.getByText('Necesitas conexión para continuar')).toBeTruthy();
    expect(screen.getByText('Revisamos los términos al entrar.')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
    expect(screen.queryByText(es.terms.accept)).toBeNull();
    expect(screen.queryByText(es.terms.checkbox)).toBeNull();
    expect(screen.queryByText(es.terms.readFull)).toBeNull();
  });

  test('Reintentar vuelve a comprobar la sesión y los términos', async () => {
    mockTermsOffline = true;
    mockRefresh.mockResolvedValue(undefined);
    await render(<TermsScreen />);
    await fireEvent.press(screen.getByText(es.terms.retry));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
