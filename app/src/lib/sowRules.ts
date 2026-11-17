/**
 * Scope of Work generado en la app (orden 112, D-318, D-320 muestra 2): secciones de la Parte A del abogado con las
 * llaves de sow_editable_keys() (migración 20261117000002) y el resumen de cada tarjeta. Sin red: se prueba solo.
 */
export type SowSectionKey = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7';

export const SOW_SECTIONS: { key: SowSectionKey; fields: string[]; optional?: boolean }[] = [
  { key: 'a1', fields: ['client_company', 'client_contact', 'client_email', 'site_address', 'area_sqft', 'floors_rooms', 'facility_type', 'walkthrough_date'] },
  { key: 'a2', fields: ['frequency', 'service_window', 'start_date', 'holidays'] },
  {
    key: 'a3',
    fields: [
      'a3_offices_area', 'a3_offices_freq', 'a3_restrooms_area', 'a3_restrooms_freq', 'a3_breakroom_area', 'a3_breakroom_freq',
      'a3_floors_area', 'a3_floors_freq', 'a3_entrances_area', 'a3_entrances_freq', 'a3_periodic_area', 'a3_periodic_task',
      'a3_periodic_freq', 'a3_addons_area', 'a3_addons_task', 'a3_addons_freq',
    ],
  },
  { key: 'a4', fields: ['a4_clarifications'] },
  { key: 'a5', fields: ['supplies_cc', 'supplies_client', 'storage'] },
  { key: 'a6', fields: ['access_method', 'keys_count', 'restricted_areas'], optional: true },
  { key: 'a7', fields: ['inspections'], optional: true },
];

export type SowData = {
  versionId: string;
  quoteId: string;
  status: string;
  fields: Record<string, string>;
  missing: string[];
  sowNo: string;
  quoteNo: string;
  quoteVersion: string;
  generated: boolean;
  sowPath: string | null;
  editable: boolean;
};

export function toSowData(d: Record<string, unknown>): SowData {
  const raw = (d.fields ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) fields[k] = typeof v === 'string' ? v : '';
  return {
    versionId: String(d.version_id ?? ''),
    quoteId: String(d.quote_id ?? ''),
    status: String(d.status ?? 'draft'),
    fields,
    missing: Array.isArray(d.missing) ? (d.missing as unknown[]).map(String) : [],
    sowNo: String(d.sow_no ?? ''),
    quoteNo: String(d.quote_no ?? ''),
    quoteVersion: String(d.quote_version ?? ''),
    generated: d.generated === true,
    sowPath: typeof d.sow_path === 'string' ? d.sow_path : null,
    editable: d.editable === true,
  };
}

const v = (f: Record<string, string>, k: string) => (f[k] ?? '').trim();

/** Líneas de la tarjeta (como la muestra de D-320): lo ya llenado, en una o dos líneas. */
export function sectionSummary(
  key: SowSectionKey,
  f: Record<string, string>,
  t: { toBeDefined: string; empty: string; areaCount: (n: number) => string },
): string[] {
  const join = (xs: string[]) => xs.filter(Boolean).join(' · ');
  switch (key) {
    case 'a1':
      return [v(f, 'client_company') || t.empty, join([v(f, 'site_address'), v(f, 'area_sqft') ? `${v(f, 'area_sqft')} sq ft` : '', v(f, 'facility_type')])];
    case 'a2':
      return [v(f, 'frequency') || t.empty, join([v(f, 'service_window'), v(f, 'start_date') || t.toBeDefined])];
    case 'a3': {
      const rows = ['offices', 'restrooms', 'breakroom', 'floors', 'entrances', 'periodic', 'addons'].filter((r) => v(f, `a3_${r}_area`));
      return [t.areaCount(rows.length), v(f, 'floors_rooms')].filter(Boolean);
    }
    case 'a4':
      return [v(f, 'a4_clarifications')].filter(Boolean);
    case 'a5':
      return [join([v(f, 'supplies_client'), v(f, 'storage')]) || t.empty];
    case 'a6':
      return [join([v(f, 'access_method'), v(f, 'keys_count'), v(f, 'restricted_areas')])].filter(Boolean);
    case 'a7':
      return [v(f, 'inspections')].filter(Boolean);
  }
}

/** Solo lo que cambió, para guardar (save_quote_sow). */
export function changedFields(before: Record<string, string>, after: Record<string, string>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if ((after[k] ?? '').trim() !== (before[k] ?? '').trim()) out[k] = (after[k] ?? '').trim();
  return out;
}
