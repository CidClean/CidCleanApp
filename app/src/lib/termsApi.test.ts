const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockGetDocument = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: (bucket: string) => ({
        upload: (...a: unknown[]) => mockUpload(bucket, ...a),
        createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(bucket, ...a),
      }),
    },
  },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockGetDocument(...a) }));

import { choosePdf, fetchCurrentTerms, fetchTermsUrl, publishTerms, termsPath } from './termsApi';

const row = { version: 2, published_at: '2026-10-05T15:00:00Z', file_path: 'staff/abc.pdf' };

beforeEach(() => {
  mockRpc.mockReset();
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockGetDocument.mockReset();
  (global as any).fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) });
});

describe('versión vigente (get_current_terms)', () => {
  test('devuelve versión, fecha y ruta del PDF', async () => {
    mockRpc.mockResolvedValue({ data: [row], error: null });
    expect(await fetchCurrentTerms()).toEqual({ ok: true, data: { version: 2, publishedAt: row.published_at, filePath: 'staff/abc.pdf', major: true } });
    expect(mockRpc).toHaveBeenCalledWith('get_current_terms', { p_kind: 'staff' });
  });
  test('sin versión publicada devuelve null', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchCurrentTerms()).toEqual({ ok: true, data: null });
  });
  test('sin conexión devuelve el error', async () => {
    mockRpc.mockRejectedValue(new Error('Network request failed'));
    expect(await fetchCurrentTerms()).toEqual({ ok: false, reason: 'network' });
  });
});

describe('leer los términos completos (D-176, D-196)', () => {
  test('firma una URL de 60 s del PDF vigente en el bucket terms', async () => {
    mockRpc.mockResolvedValue({ data: [row], error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/terms-firmada' }, error: null });
    expect(await fetchTermsUrl()).toEqual({ ok: true, data: { url: 'https://x/terms-firmada' } });
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('terms', 'staff/abc.pdf', 60);
  });
  test('sin versión publicada no devuelve nada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchTermsUrl()).toEqual({ ok: false, reason: 'not_found' });
  });
  test('si no se puede firmar o no hay conexión no devuelve nada', async () => {
    mockRpc.mockResolvedValue({ data: [row], error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect((await fetchTermsUrl()).ok).toBe(false);
    mockCreateSignedUrl.mockRejectedValue(new Error('Network request failed'));
    expect(await fetchTermsUrl()).toEqual({ ok: false, reason: 'network' });
  });
});

describe('publicar una versión (D-176)', () => {
  const pdf = { uri: 'file:///tmp/terminos-staff-v2.pdf', name: 'terminos-staff-v2.pdf' };

  test('la ruta es staff/<nombre único>.pdf', () => {
    expect(termsPath('abc')).toBe('staff/abc.pdf');
    expect(termsPath()).toMatch(/^staff\/[a-z0-9]+\.pdf$/);
  });

  test('primero sube el PDF al bucket terms y después llama a publish_terms con la misma ruta', async () => {
    const order: string[] = [];
    mockUpload.mockImplementation(async () => (order.push('subir'), { error: null }));
    mockRpc.mockImplementation(async () => (order.push('publicar'), { error: null }));
    expect(await publishTerms(pdf)).toEqual({ ok: true, data: null });
    expect(order).toEqual(['subir', 'publicar']);
    const [bucket, path, , options] = mockUpload.mock.calls[0];
    expect(bucket).toBe('terms');
    expect(path).toMatch(/^staff\/[a-z0-9]+\.pdf$/);
    expect(options).toEqual({ contentType: 'application/pdf' });
    expect(mockRpc).toHaveBeenCalledWith('publish_terms', { kind: 'staff', file_path: path, major: true });
  });

  test('si falla la subida no se publica nada', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'x' } });
    expect((await publishTerms(pdf)).ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('quien no es Super Admin recibe el rechazo de la base (42501)', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await publishTerms(pdf)).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('escoger el PDF', () => {
  test('pide solo PDF y devuelve su nombre', async () => {
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.pdf', name: 'a.pdf' }] });
    expect(await choosePdf()).toEqual({ kind: 'picked', file: { uri: 'file:///a.pdf', name: 'a.pdf' } });
    expect(mockGetDocument).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }));
  });
  test('si se cancela no devuelve archivo', async () => {
    mockGetDocument.mockResolvedValue({ canceled: true, assets: null });
    expect(await choosePdf()).toEqual({ kind: 'cancelled' });
  });
});
