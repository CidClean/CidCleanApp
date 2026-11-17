import { sowEn, sowEs } from '@/i18n/sow';
import { SOW_SECTIONS, changedFields, sectionSummary, toSowData } from './sowRules';

describe('Scope of Work (orden 112, D-318, D-320)', () => {
  const t = { toBeDefined: 'Por definir', empty: '—', areaCount: sowEs.areaRows };
  it('cada llave del SOW tiene etiqueta en los dos idiomas', () => {
    for (const s of SOW_SECTIONS) {
      expect(sowEs.sections[s.key]).toBeTruthy();
      expect(sowEn.sections[s.key]).toBeTruthy();
      for (const k of s.fields) {
        expect(sowEs.fields[k]).toBeTruthy();
        expect(sowEn.fields[k]).toBeTruthy();
      }
    }
  });
  it('A6 y A7 son opcionales; el precio no es una llave del SOW', () => {
    expect(SOW_SECTIONS.filter((s) => s.optional).map((s) => s.key)).toEqual(['a6', 'a7']);
    expect(SOW_SECTIONS.flatMap((s) => s.fields)).not.toContain('price');
  });
  it('tarjetas como la muestra: A1 y A2 con inicio por definir', () => {
    const f = { client_company: 'Superior Pool LLC', site_address: '280 Commercial Blvd, Naples, FL 34104', area_sqft: '3,000', facility_type: 'Retail / showroom', frequency: '3 days per week', service_window: 'After 5:00 PM', start_date: '' };
    expect(sectionSummary('a1', f, t)).toEqual(['Superior Pool LLC', '280 Commercial Blvd, Naples, FL 34104 · 3,000 sq ft · Retail / showroom']);
    expect(sectionSummary('a2', f, t)).toEqual(['3 days per week', 'After 5:00 PM · Por definir']);
    expect(sectionSummary('a3', { a3_offices_area: 'Offices', a3_floors_area: 'Hard floors', floors_rooms: '3 areas' }, t)).toEqual(['2 filas de tareas', '3 areas']);
    expect(sectionSummary('a6', {}, t)).toEqual([]);
  });
  it('solo se guarda lo que cambió', () => {
    expect(changedFields({ storage: '', inspections: 'x' }, { storage: ' Closet ', inspections: 'x' }, ['storage', 'inspections'])).toEqual({ storage: 'Closet' });
  });
  it('lee lo que devuelve quote_sow', () => {
    const d = toSowData({ version_id: 'v', quote_id: 'q', fields: { storage: 'A', n: 3 }, missing: ['storage'], sow_no: 'SOW-0007', editable: true });
    expect(d.fields).toEqual({ storage: 'A', n: '' });
    expect(d.missing).toEqual(['storage']);
    expect(d.editable).toBe(true);
    expect(d.sowPath).toBeNull();
  });
});
