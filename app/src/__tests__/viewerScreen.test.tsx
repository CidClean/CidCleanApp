import { render, screen, waitFor } from '@testing-library/react-native';

import { getStrings } from '@/i18n';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('@/lib/contractApi', () => ({ fetchContractInfo: async () => ({ ok: true, data: null }), fetchCleaningType: async () => null, saveCleaningType: async () => true, fetchUnsignedJobsites: async () => new Set(), fetchContractPreviewUrl: async () => ({ ok: false, reason: 'server' }), contractStep: () => 1, fieldsToShow: () => [] })); // D-289
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/session', () => ({ useSession: () => ({ termsPending: false, termsOffline: false }) }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));

const mockFetchDocumentUrl = jest.fn();
const mockFetchTermsUrl = jest.fn();
jest.mock('@/lib/documents', () => ({ fetchDocumentUrl: (...a: unknown[]) => mockFetchDocumentUrl(...a), logDocumentDownload: jest.fn() }));
jest.mock('@/lib/termsApi', () => ({ fetchTermsUrl: (...a: unknown[]) => mockFetchTermsUrl(...a) }));
const mockFetchQuoteFileUrl = jest.fn();
jest.mock('@/lib/quotesApi', () => ({ fetchQuoteFileUrl: (...a: unknown[]) => mockFetchQuoteFileUrl(...a) }));
const mockFetchWalkthroughPdf = jest.fn();
jest.mock('@/lib/walkthroughApi', () => ({ fetchWalkthroughPdfUrl: (...a: unknown[]) => mockFetchWalkthroughPdf(...a) }));

const mockFetchJobsiteDoc = jest.fn();
jest.mock('@/lib/clientsApi', () => ({ fetchJobsiteDocumentUrl: (...a: unknown[]) => mockFetchJobsiteDoc(...a) }));

const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a) }));

const mockDownload = jest.fn();
const mockRemove = jest.fn();
let mockPdfViewAvailable = true;
jest.mock('@/lib/viewerFile', () => {
  const actual = jest.requireActual('@/lib/viewerFile');
  return {
    ...actual,
    downloadToCache: (...a: unknown[]) => mockDownload(...a),
    removeCachedFile: (...a: unknown[]) => mockRemove(...a),
    clearViewerCache: jest.fn(),
    loadPdfView: () => {
      if (!mockPdfViewAvailable) return null;
      const { View } = require('react-native');
      return (props: { uri: string }) => <View testID="pdf-view" accessibilityLabel={props.uri} />;
    },
  };
});
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: 'file:///cache/' } }));

import ViewerScreen from '@/app/viewer';

const es = getStrings('es');
const cached = { uri: 'file:///cache/viewer/abc.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPdfViewAvailable = true;
  mockParams = { source: 'document', documentId: 'd1', title: es.employee.w9 };
  mockFetchDocumentUrl.mockResolvedValue({ ok: true, data: { url: 'https://x/object/sign/employee-docs/p1/w9/abc.pdf?token=t' } });
  mockFetchTermsUrl.mockResolvedValue({ ok: true, data: { url: 'https://x/object/sign/terms/staff/abc.pdf?token=t' } });
  mockDownload.mockResolvedValue(cached);
});

describe('visor de PDF dentro de la app (D-196)', () => {
  test('documento: pide la URL a open-document, la baja a la caché privada y la muestra en el visor nativo', async () => {
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('pdf-view')).toBeTruthy());
    expect(mockFetchDocumentUrl).toHaveBeenCalledWith('d1');
    expect(mockFetchTermsUrl).not.toHaveBeenCalled();
    expect(mockDownload).toHaveBeenCalledWith('https://x/object/sign/employee-docs/p1/w9/abc.pdf?token=t');
    expect(screen.getByTestId('pdf-view').props.accessibilityLabel).toBe(cached.uri);
  });

  test('la barra lleva la flecha de volver y el nombre del documento; sin compartir ni descargar', async () => {
    await render(<ViewerScreen />);
    await waitFor(() => screen.getByTestId('pdf-view'));
    expect(screen.getByText(es.employee.w9)).toBeTruthy();
    expect(screen.getByLabelText(es.common.back)).toBeTruthy();
    // El único botón de la pantalla es la flecha de volver.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('walkthrough (D-212): pide el PDF de la versión a walkthrough-pdf, en el idioma de la persona', async () => {
    mockParams = { source: 'walkthrough', documentId: 'w1', version: '2', language: 'en', title: 'Walkthrough · Gulf' };
    mockFetchWalkthroughPdf.mockResolvedValue({ ok: true, data: { url: 'https://x/object/sign/walkthrough-pdfs/w1/v2.pdf?token=t' } });
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('pdf-view')).toBeTruthy());
    expect(mockFetchWalkthroughPdf).toHaveBeenCalledWith('w1', 2, 'en');
    expect(mockFetchDocumentUrl).not.toHaveBeenCalled();
  });

  test('términos: usa el Storage firmado de terms, no open-document', async () => {
    mockParams = { source: 'terms', title: es.settings.termsRow };
    await render(<ViewerScreen />);
    await waitFor(() => screen.getByTestId('pdf-view'));
    expect(mockFetchTermsUrl).toHaveBeenCalledTimes(1);
    expect(mockFetchDocumentUrl).not.toHaveBeenCalled();
    expect(screen.getByText(es.settings.termsRow)).toBeTruthy();
  });

  test('al cerrar el visor se borra el archivo de la caché', async () => {
    const view = await render(<ViewerScreen />);
    await waitFor(() => screen.getByTestId('pdf-view'));
    expect(mockRemove).not.toHaveBeenCalledWith(cached);
    await view.unmount();
    expect(mockRemove).toHaveBeenCalledWith(cached);
  });

  test('si se cierra mientras se descarga, el archivo se borra apenas llega', async () => {
    let finish: (f: typeof cached) => void = () => {};
    mockDownload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = await render(<ViewerScreen />);
    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    await view.unmount();
    finish(cached);
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(cached));
  });

  test('una foto de un 1099 se muestra como imagen, no en el visor de PDF', async () => {
    mockFetchDocumentUrl.mockResolvedValue({ ok: true, data: { url: 'https://x/object/sign/employee-docs/p1/w9/abc.jpg?token=t' } });
    mockDownload.mockResolvedValue({ uri: 'file:///cache/viewer/abc.jpg' });
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByLabelText(es.employee.w9, { hidden: true })).toBeTruthy());
    expect(screen.queryByTestId('pdf-view')).toBeNull();
    expect(mockDownload).toHaveBeenCalled();
  });

  test('Expo Go (sin el módulo nativo): abre el navegador del sistema con la URL firmada y vuelve', async () => {
    mockPdfViewAvailable = false;
    await render(<ViewerScreen />);
    await waitFor(() => expect(mockOpenBrowser).toHaveBeenCalledWith('https://x/object/sign/employee-docs/p1/w9/abc.pdf?token=t'));
    expect(mockDownload).not.toHaveBeenCalled();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  test('sin permiso o sin conexión: el aviso rojo del documento (D-195) y no se descarga nada', async () => {
    mockFetchDocumentUrl.mockResolvedValue({ ok: false, reason: 'forbidden' });
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByText(es.employee.errorOpen)).toBeTruthy());
    expect(mockDownload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pdf-view')).toBeNull();
  });

  test('términos que no se pueden cargar: el aviso de D-178', async () => {
    mockParams = { source: 'terms', title: es.settings.termsRow };
    mockFetchTermsUrl.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByText(es.terms.errorLoad)).toBeTruthy());
  });

  test('si falla la descarga muestra el aviso y no deja archivo', async () => {
    mockDownload.mockRejectedValue(new Error('UnableToDownload'));
    await render(<ViewerScreen />);
    await waitFor(() => expect(screen.getByText(es.employee.errorOpen)).toBeTruthy());
  });
});
