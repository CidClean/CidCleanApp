import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import { myDocumentCards, showsMyDocuments } from './myDocuments';

describe('Mis documentos (D-263, D-271)', () => {
  it('solo el 1099', () => {
    expect(showsMyDocuments({ workerType: '1099' })).toBe(true);
    expect(showsMyDocuments({ workerType: 'w2' })).toBe(false);
    expect(showsMyDocuments({ workerType: null })).toBe(false);
    expect(showsMyDocuments(null)).toBe(false);
  });

  it('con W-9 firmado y certificado: Firmado, Subido y "Subir certificado nuevo" con la nota', () => {
    const cards = myDocumentCards(
      [
        { id: 'w', kind: 'w9', uploadedAt: '2026-10-27T15:00:00Z' },
        { id: 'c', kind: 'insurance_certificate', uploadedAt: '2026-09-17T15:00:00Z' },
      ],
      es,
      'es',
    );
    expect(cards[0]).toMatchObject({ title: 'W-9', detail: 'Firmado el 27 oct 2026', chip: 'Firmado', tone: 'success', documentId: 'w', upload: null });
    expect(cards[1]).toMatchObject({
      title: 'Certificado de seguro',
      detail: 'Subido el 17 sep 2026',
      chip: 'Subido',
      tone: 'success',
      upload: { label: 'Subir certificado nuevo', variant: 'outline', note: 'Cuando renueves tu seguro, sube el certificado nuevo. Reemplaza al anterior.' },
    });
  });

  it('sin archivos: Sin archivo, Falta y botón lleno "Subir certificado" sin nota', () => {
    const cards = myDocumentCards([], es, 'es');
    expect(cards.map((c) => [c.detail, c.chip, c.tone])).toEqual([
      ['Sin archivo', 'Falta', 'warning'],
      ['Sin archivo', 'Falta', 'warning'],
    ]);
    expect(cards[1].upload).toEqual({ label: 'Subir certificado', variant: 'solid', note: null });
  });

  it('en inglés', () => {
    const cards = myDocumentCards([{ id: 'w', kind: 'w9', uploadedAt: '2026-10-27T15:00:00Z' }], en, 'en');
    expect(cards[0].detail).toBe('Signed on Oct 27, 2026');
    expect(cards[1].upload?.label).toBe('Upload certificate');
  });
});
