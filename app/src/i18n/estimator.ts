import type { Locale } from './index';

/** Ajustes → Estimador del sitio (orden 91; D-309). Textos de detalle menor delegados (D-200) salvo el nombre de la fila. */
export const estimatorEs = {
  row: 'Estimador del sitio', // orden 91
  rowDetail: (min: string) => `Mínimo ${min} por visita`, // D-200
  intro: 'Tarifas que usa el estimador de cidclean.com. El sitio siempre calcula con las guardadas aquí.', // D-200
  types: 'Tipos de lugar', // D-200
  rate: '$ por sq ft por visita', // D-200
  frequencies: 'Frecuencias', // D-200
  visits: 'Visitas al mes', // D-200
  adjustment: 'Ajuste', // D-200
  general: 'General', // D-200
  minPerVisit: 'Mínimo por visita ($)', // D-200
  rangePercent: 'Rango (± %)', // D-200
  roundTo: 'Redondeo ($)', // D-200
  walkthroughSqft: 'Recomendar walkthrough desde (sq ft)', // D-200
  preview: 'Vista previa', // D-200
  previewWhat: 'Oficina de 3,000 sq ft, 3 veces por semana', // orden 91
  previewPerVisit: (v: string) => `por mes · unos ${v} por visita`, // D-200
  previewInvalid: 'Corrige los valores marcados para ver el ejemplo.', // D-200
  errorValue: 'Valor no válido.', // D-200
  errorLoad: 'No se pudieron cargar las tarifas. Inténtalo otra vez.', // D-200
  errorSave: 'No se pudieron guardar las tarifas. Inténtalo otra vez.', // D-200
  saved: 'Tarifas guardadas.', // D-200
};

export type EstimatorStrings = typeof estimatorEs;

export const estimatorEn: EstimatorStrings = {
  row: 'Website estimator',
  rowDetail: (min: string) => `Minimum ${min} per visit`,
  intro: 'Rates used by the cidclean.com estimator. The website always calculates with the ones saved here.',
  types: 'Types of space',
  rate: '$ per sq ft per visit',
  frequencies: 'Frequencies',
  visits: 'Visits per month',
  adjustment: 'Adjustment',
  general: 'General',
  minPerVisit: 'Minimum per visit ($)',
  rangePercent: 'Range (± %)',
  roundTo: 'Rounding ($)',
  walkthroughSqft: 'Recommend a walkthrough from (sq ft)',
  preview: 'Preview',
  previewWhat: 'Office, 3,000 sq ft, 3 times a week',
  previewPerVisit: (v: string) => `per month · about ${v} per visit`,
  previewInvalid: 'Fix the highlighted values to see the example.',
  errorValue: 'Invalid value.',
  errorLoad: "Couldn't load the rates. Try again.",
  errorSave: "Couldn't save the rates. Try again.",
  saved: 'Rates saved.',
};

export function getEstimatorStrings(locale: Locale): EstimatorStrings {
  return locale === 'es' ? estimatorEs : estimatorEn;
}
