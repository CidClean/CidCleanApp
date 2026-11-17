jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
let mockIsSuperAdmin = true;
let mockPerms = new Set<string>(['leads_ver']);

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
    access: { isSuperAdmin: mockIsSuperAdmin, permissions: mockPerms },
    isSuperAdmin: mockIsSuperAdmin,
    can: (k: string) => mockIsSuperAdmin || mockPerms.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const mockFetchTemplates = jest.fn();
const mockFetchTemplate = jest.fn();
const mockSave = jest.fn();
const mockContext = jest.fn();
const mockLog = jest.fn();
jest.mock('@/lib/emailTemplatesApi', () => ({
  fetchTemplates: (...a: unknown[]) => mockFetchTemplates(...a),
  fetchTemplate: (...a: unknown[]) => mockFetchTemplate(...a),
  saveTemplate: (...a: unknown[]) => mockSave(...a),
  deleteTemplate: jest.fn(),
  fetchTemplateContext: (...a: unknown[]) => mockContext(...a),
  logTemplateEmail: (...a: unknown[]) => mockLog(...a),
  fetchEmailLog: jest.fn().mockResolvedValue({ ok: true, data: [] }),
}));

import SendEmailScreen from '@/app/(app)/send-email';
import EmailTemplateFormScreen from '@/app/(app)/settings/email-templates/edit';
import EmailTemplatesScreen from '@/app/(app)/settings/email-templates';

const primer = {
  id: 't1',
  name: 'Primer contacto',
  audience: 'prospect',
  subject: 'Commercial cleaning for {empresa}',
  body: 'Hi {nombre},\n\nI can visit {dirección}.\n\n{firma}',
  active: true,
  sort: 1,
};
const ctx = {
  company: 'Superior Pool Products',
  address: '280 Commercial Blvd',
  contacts: [{ name: 'Armando Zerquera', email: 'armando.zerquera@poolcorp.com', address: '280 Commercial Blvd' }],
  sender: { name: 'Humberto Villiva', phone: '(786) 250-1324' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperAdmin = true;
  mockPerms = new Set(['leads_ver']);
  mockFetchTemplates.mockResolvedValue({ ok: true, data: [primer] });
  mockContext.mockResolvedValue({ ok: true, data: ctx });
  mockLog.mockResolvedValue({ ok: true, data: null });
  mockSave.mockResolvedValue({ ok: true, data: null });
});

describe('Enviar correo (lead)', () => {
  it('solo pide plantillas de prospectos activas y abre el mailto llenado', async () => {
    mockParams = { kind: 'lead', id: 'L1' };
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<SendEmailScreen />);
    expect(mockFetchTemplates).toHaveBeenCalledWith('prospect', true);
    await fireEvent.press(await screen.findByText('Continuar'));
    expect(screen.getByTestId('email-body')).toHaveTextContent(/Hi Armando,/);
    expect(screen.getByText(/Commercial cleaning for Superior Pool Products/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Abrir en mi correo'));
    await waitFor(() => expect(mockLog).toHaveBeenCalledWith('t1', 'lead', 'L1', 'open'));
    // D-328: copia el texto completo y abre el correo solo con destinatario y asunto.
    expect(open.mock.calls[0][0]).toBe('mailto:armando.zerquera@poolcorp.com?subject=Commercial%20cleaning%20for%20Superior%20Pool%20Products');
    expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith(expect.stringMatching(/^Hi Armando,/));
  });

  it('sin correo ni teléfono los marca y no abre', async () => {
    mockParams = { kind: 'lead', id: 'L1' };
    mockContext.mockResolvedValue({ ok: true, data: { ...ctx, contacts: [{ name: 'Ana', email: null, address: null }], sender: { name: 'H', phone: null } } });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<SendEmailScreen />);
    await fireEvent.press(await screen.findByText('Continuar'));
    expect(screen.getByText('Puedes completar estos datos. Si los dejas vacíos, el correo usa un texto genérico.')).toBeTruthy();
    // El campo que falta sigue visible después de escribir la primera letra (bug del 2026-11-17).
    const fields = screen.getAllByDisplayValue('');
    await fireEvent.changeText(fields[fields.length - 1], '2');
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Abrir en mi correo'));
    expect(screen.getByText('Falta el correo del contacto. Escríbelo para continuar.')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('en un cliente pide las plantillas de clientes', async () => {
    mockParams = { kind: 'client', id: 'C1' };
    mockPerms = new Set(['clientes_ver']);
    mockIsSuperAdmin = false;
    mockFetchTemplates.mockResolvedValue({ ok: true, data: [] });
    await render(<SendEmailScreen />);
    await waitFor(() => expect(mockFetchTemplates).toHaveBeenCalledWith('client', true));
    expect(await screen.findByText(/No hay plantillas activas/)).toBeTruthy();
  });
});

describe('Ajustes → Plantillas de correo', () => {
  it('lista con Activa e Inactiva y solo para el Super Admin', async () => {
    mockParams = {};
    mockFetchTemplates.mockResolvedValue({ ok: true, data: [primer, { ...primer, id: 't3', name: 'Seguimiento final', active: false, sort: 3 }] });
    await render(<EmailTemplatesScreen />);
    expect(await screen.findByText('Primer contacto')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();
    expect(screen.getByText('Nueva plantilla')).toBeTruthy();
  });

  it('quien no es Super Admin no entra', async () => {
    mockIsSuperAdmin = false;
    await render(<EmailTemplatesScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });

  it('nueva plantilla: inserta {firma} y guarda', async () => {
    mockParams = { audience: 'client', sort: '1' };
    await render(<EmailTemplateFormScreen />);
    expect(screen.getByText('El pie legal se agrega solo al enviar. No hace falta escribirlo.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Aviso');
    await fireEvent.changeText(screen.getByLabelText('Asunto'), 'Hello {empresa}');
    await fireEvent.changeText(screen.getByLabelText('Texto'), 'Hi,\n');
    await fireEvent.press(screen.getByLabelText('Insertar {firma}'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(null, { name: 'Aviso', audience: 'client', subject: 'Hello {empresa}', body: 'Hi,\n{firma}', active: true }, 1),
    );
  });
});
