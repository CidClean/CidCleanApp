import { documentsLibraryEn, documentsLibraryEs } from '@/i18n/documentsLibrary';
import { canSeeDocuments, rowTitle, toLibraryDoc, viewerParams, LIBRARY_FILTERS } from './documentsLibrary';
import { visibleMenuItems } from './visibility';

jest.mock('./supabase', () => ({ supabase: {} }));

const acc = (keys: string[], isSuperAdmin = false) => ({ isSuperAdmin, permissions: new Set(keys) });

describe('Menú → Documentos (orden 115, D-317 4, D-320)', () => {
  it('solo con algún permiso que dé documentos', () => {
    expect(canSeeDocuments(acc([]))).toBe(false);
    expect(canSeeDocuments(acc(['quotes_ver']))).toBe(false); // sin precios, el PDF del quote no se ve
    expect(canSeeDocuments(acc(['quotes_ver', 'quotes_ver_precios']))).toBe(true);
    expect(canSeeDocuments(acc(['empleados_ver_pagos']))).toBe(true);
    expect(canSeeDocuments(acc([], true))).toBe(true);
    expect(visibleMenuItems(acc([]))).not.toContain('documents');
    expect(visibleMenuItems(acc(['clientes_ver']))).toContain('documents');
  });
  it('filtros de la muestra y textos en los dos idiomas', () => {
    expect([...LIBRARY_FILTERS]).toEqual(['all', 'quotes', 'sow', 'contracts', 'walkthroughs', 'personal', 'reports']);
    for (const f of LIBRARY_FILTERS) {
      expect(documentsLibraryEs.filters[f]).toBeTruthy();
      expect(documentsLibraryEn.filters[f]).toBeTruthy();
    }
  });
  it('abre cada documento con su visor y su función de siempre', () => {
    const q = toLibraryDoc({ doc_kind: 'quote', doc_id: 'v', title: 'Quote Q-0007 v1.0', owner: 'Acme', open_source: 'quote-file', open_path: 'q/v/quote-1.0.pdf' });
    expect(viewerParams(q, 'Quote', 'es')).toEqual({ source: 'quote-file', title: 'Quote', download: '1', path: 'q/v/quote-1.0.pdf' });
    const w = toLibraryDoc({ doc_kind: 'walkthrough', doc_id: 'w:2', title: 'Walkthrough v2', open_source: 'walkthrough', open_id: 'w', open_version: 2 });
    expect(viewerParams(w, 'W', 'en')).toEqual({ source: 'walkthrough', title: 'W', download: '1', documentId: 'w', version: '2', language: 'en' });
    const c = toLibraryDoc({ doc_kind: 'contract', doc_id: 'd', title: 'contract v1', open_source: 'jobsite', open_id: 'd' });
    expect(rowTitle(c, documentsLibraryEs)).toBe('Contrato firmado · v1');
    expect(rowTitle(toLibraryDoc({ doc_kind: 'personal', title: 'Insurance certificate' }), documentsLibraryEs)).toBe('Certificado de seguro');
  });
});
