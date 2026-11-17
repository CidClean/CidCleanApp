import type { Locale } from './index';

/**
 * Textos de la pantalla "Scope of Work" (orden 112, D-318, D-320 muestra 2). APROBADO = de la muestra aprobada;
 * D-200 = detalle menor del ejecutor. Las etiquetas de los campos siguen las filas de la Parte A del abogado.
 */
export const sowEs = {
  title: 'Scope of Work', // APROBADO (D-320, muestra 2)
  intro: 'Se arma solo con el walkthrough. Revisa y corrige.', // APROBADO (D-320, muestra 2)
  open: 'Scope of Work', // D-200: fila del editor del quote
  openDetail: (n: number) => (n === 0 ? 'Listo para enviar' : n === 1 ? 'Falta 1 dato' : `Faltan ${n} datos`), // D-200
  edit: 'Editar', // APROBADO (D-320)
  viewPdf: 'Ver PDF del SOW', // APROBADO (D-320)
  send: 'Enviar quote', // APROBADO (D-320)
  save: 'Guardar', // D-200
  cancel: 'Cancelar', // D-200
  missing: (labels: string) => `Falta completar: ${labels}.`, // D-200
  optional: 'Opcional. Vacío = "None"', // APROBADO (D-320, muestra 2)
  fixedText: 'Texto del abogado (fijo).', // APROBADO (D-320, muestra 2)
  noPrice: 'El precio no aparece en el SOW: va en el quote.', // APROBADO (D-320)
  toBeDefined: 'Por definir', // APROBADO (D-320, muestra 2: "Inicio: por definir")
  empty: '—', // D-200
  errorLoad: 'No se pudo abrir el SOW. Inténtalo otra vez.', // D-200
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // D-200
  pdfTitle: (company: string) => `SOW · ${company}`, // D-200: título del visor
  uploaded: 'Este quote tiene un SOW subido antes; al enviar una versión nueva se arma en la app.', // D-200
  sections: {
    a1: 'A1 · Partes y sitio', // APROBADO (D-320)
    a2: 'A2 · Horario', // APROBADO (D-320)
    a3: 'A3 · Tareas por área', // APROBADO (D-320)
    a4: 'A4 · Exclusiones', // APROBADO (D-320)
    a5: 'A5 · Suministros', // D-200 (orden 112: A5 suministros)
    a6: 'A6 · Acceso y seguridad', // APROBADO (D-320)
    a7: 'A7 · Inspecciones', // D-200 (orden 112: A7 opcional)
  },
  fields: {
    client_company: 'Cliente (nombre legal)',
    client_contact: 'Contacto',
    client_email: 'Correo del contacto',
    site_address: 'Dirección del sitio',
    area_sqft: 'Pies cuadrados aprox.',
    floors_rooms: 'Áreas',
    facility_type: 'Tipo de lugar',
    walkthrough_date: 'Fecha del walkthrough',
    frequency: 'Frecuencia',
    service_window: 'Horario de servicio',
    start_date: 'Inicio',
    holidays: 'Feriados sin servicio',
    a3_offices_area: 'Oficinas: área', a3_offices_freq: 'Oficinas: frecuencia',
    a3_restrooms_area: 'Baños: área', a3_restrooms_freq: 'Baños: frecuencia',
    a3_breakroom_area: 'Cocina: área', a3_breakroom_freq: 'Cocina: frecuencia',
    a3_floors_area: 'Pisos: área', a3_floors_freq: 'Pisos: frecuencia',
    a3_entrances_area: 'Entradas: área', a3_entrances_freq: 'Entradas: frecuencia',
    a3_periodic_area: 'Periódico: área', a3_periodic_task: 'Periódico: tareas', a3_periodic_freq: 'Periódico: frecuencia',
    a3_addons_area: 'Adicionales: área', a3_addons_task: 'Adicionales: tareas', a3_addons_freq: 'Adicionales: frecuencia',
    a4_clarifications: 'Aclaraciones de este sitio', // APROBADO (D-320)
    supplies_cc: 'Cid Clean pone (además de químicos y equipo)',
    supplies_client: 'El cliente pone',
    storage: 'Almacén en el sitio',
    access_method: 'Acceso', // APROBADO (D-320)
    keys_count: 'Llaves o fobs', // APROBADO (D-320: "Llaves")
    restricted_areas: 'Áreas restringidas', // APROBADO (D-320)
    inspections: 'Inspecciones de calidad',
  } as Record<string, string>, // D-200 salvo lo marcado
  a3Hint: 'Deja vacía el área de una fila para quitarla del SOW.', // D-200
  areaRows: (n: number) => (n === 1 ? '1 fila de tareas' : `${n} filas de tareas`), // D-200
};

export type SowStrings = typeof sowEs;

export const sowEn: SowStrings = {
  title: 'Scope of Work',
  intro: 'Built from the walkthrough. Review and correct it.',
  open: 'Scope of Work',
  openDetail: (n: number) => (n === 0 ? 'Ready to send' : n === 1 ? '1 item missing' : `${n} items missing`),
  edit: 'Edit',
  viewPdf: 'View SOW PDF',
  send: 'Send quote',
  save: 'Save',
  cancel: 'Cancel',
  missing: (labels: string) => `Still missing: ${labels}.`,
  optional: 'Optional. Empty = "None"',
  fixedText: "Attorney's text (fixed).",
  noPrice: 'The price is not in the SOW: it goes in the quote.',
  toBeDefined: 'To be defined',
  empty: '—',
  errorLoad: "Couldn't open the SOW. Try again.",
  errorSave: "Couldn't save. Try again.",
  pdfTitle: (company: string) => `SOW · ${company}`,
  uploaded: 'This quote has an SOW uploaded earlier; a new version builds it in the app.',
  sections: {
    a1: 'A1 · Parties and site',
    a2: 'A2 · Schedule',
    a3: 'A3 · Tasks by area',
    a4: 'A4 · Exclusions',
    a5: 'A5 · Supplies',
    a6: 'A6 · Access and security',
    a7: 'A7 · Inspections',
  },
  fields: {
    client_company: 'Client (legal name)',
    client_contact: 'Contact',
    client_email: 'Contact email',
    site_address: 'Site address',
    area_sqft: 'Approx. square feet',
    floors_rooms: 'Areas',
    facility_type: 'Type of facility',
    walkthrough_date: 'Walkthrough date',
    frequency: 'Frequency',
    service_window: 'Service schedule',
    start_date: 'Start date',
    holidays: 'Holidays not serviced',
    a3_offices_area: 'Offices: area', a3_offices_freq: 'Offices: frequency',
    a3_restrooms_area: 'Restrooms: area', a3_restrooms_freq: 'Restrooms: frequency',
    a3_breakroom_area: 'Kitchen: area', a3_breakroom_freq: 'Kitchen: frequency',
    a3_floors_area: 'Floors: area', a3_floors_freq: 'Floors: frequency',
    a3_entrances_area: 'Entrances: area', a3_entrances_freq: 'Entrances: frequency',
    a3_periodic_area: 'Periodic: area', a3_periodic_task: 'Periodic: tasks', a3_periodic_freq: 'Periodic: frequency',
    a3_addons_area: 'Add-ons: area', a3_addons_task: 'Add-ons: tasks', a3_addons_freq: 'Add-ons: frequency',
    a4_clarifications: 'Clarifications for this site',
    supplies_cc: 'Cid Clean provides (besides chemicals and equipment)',
    supplies_client: 'Client provides',
    storage: 'On-site storage',
    access_method: 'Access',
    keys_count: 'Keys or fobs',
    restricted_areas: 'Restricted areas',
    inspections: 'Quality inspections',
  },
  a3Hint: "Leave a row's area empty to remove it from the SOW.",
  areaRows: (n: number) => (n === 1 ? '1 task row' : `${n} task rows`),
};

export function getSowStrings(locale: Locale): SowStrings {
  return locale === 'en' ? sowEn : sowEs;
}
