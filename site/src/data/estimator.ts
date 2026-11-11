// Claves y nombres de las opciones del estimador (D-309). Las tarifas NO viven aquí: el servidor usa las de estimator_settings.
export const PLACE_TYPES = [
  { key: 'office', label: 'Office' },
  { key: 'medical', label: 'Medical / dental office' },
  { key: 'retail', label: 'Retail / showroom' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'light_industrial', label: 'Light industrial' },
  { key: 'gym', label: 'Gym / fitness' },
  { key: 'other', label: 'Other commercial' },
] as const;

export const FREQUENCIES = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'weekly_1', label: '1x per week' },
  { key: 'weekly_2', label: '2x per week' },
  { key: 'weekly_3', label: '3x per week' },
  { key: 'weekly_5', label: '5x per week' },
] as const;
