const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a), createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a) }) },
  },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));

import { FunctionsHttpError } from '@supabase/supabase-js';

import { documentPath, fetchDocumentUrl, uploadDocument } from './documents';

const file = { uri: 'file:///tmp/a.pdf', mimeType: 'application/pdf', name: 'a.pdf' };

beforeEach(() => {
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockRpc.mockReset();
  mockInvoke.mockReset();
  (global as any).fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) });
});

describe('subir un documento (D-183)', () => {
  test('la ruta es <empleado>/<tipo>/<nombre>.<ext>', () => {
    expect(documentPath('p1', 'w9', file, 'abc')).toBe('p1/w9/abc.pdf');
    expect(documentPath('p1', 'insurance_certificate', { uri: 'x', mimeType: 'image/jpeg', name: null }, 'abc')).toBe('p1/insurance_certificate/abc.jpg');
  });

  test('primero sube al bucket y después lo registra como el documento vigente', async () => {
    const order: string[] = [];
    mockUpload.mockImplementation(async () => (order.push('mockUpload'), { error: null }));
    mockRpc.mockImplementation(async () => (order.push('register'), { error: null }));
    expect(await uploadDocument('p1', 'w9', file)).toEqual({ ok: true, data: null });
    expect(order).toEqual(['mockUpload', 'register']);
    const [path, , options] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^p1\/w9\/[a-z0-9]+\.pdf$/);
    expect(options).toEqual({ contentType: 'application/pdf' });
    expect(mockRpc).toHaveBeenCalledWith('register_profile_document', { p_profile: 'p1', p_kind: 'w9', p_path: path });
  });

  test('si falla la subida no se registra nada', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'x' } });
    expect((await uploadDocument('p1', 'w9', file)).ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('sin permiso la base lo rechaza (42501)', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await uploadDocument('p1', 'w9', file)).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('pedir la URL de un documento (D-125, D-196): solo con la Edge Function open-document', () => {
  test('llama a open-document con el id y devuelve la URL firmada', async () => {
    mockInvoke.mockResolvedValue({ data: { url: 'https://x/firmada', expires_in: 60 }, error: null });
    expect(await fetchDocumentUrl('d1')).toEqual({ ok: true, data: { url: 'https://x/firmada' } });
    expect(mockInvoke).toHaveBeenCalledWith('open-document', { body: { document_id: 'd1' } });
  });

  test('no usa open_profile_document ni firma nada desde Storage por su cuenta', async () => {
    mockInvoke.mockResolvedValue({ data: { url: 'https://x/firmada' }, error: null });
    await fetchDocumentUrl('d1');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  test('sin permiso (403) no devuelve nada', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })),
    });
    expect(await fetchDocumentUrl('d1')).toEqual({ ok: false, reason: 'forbidden' });
  });

  test('sin conexión no devuelve nada', async () => {
    mockInvoke.mockRejectedValue(new Error('Network request failed'));
    expect(await fetchDocumentUrl('d1')).toEqual({ ok: false, reason: 'network' });
  });

  test('una respuesta sin URL es un error del servidor', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    expect(await fetchDocumentUrl('d1')).toEqual({ ok: false, reason: 'server' });
  });
});
