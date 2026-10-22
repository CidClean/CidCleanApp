import type { Locale } from './index';
import type { AreaType, Condition } from '@/lib/walkthroughRules';

/**
 * Textos del walkthrough (hito 3). APROBADO = de una decisión o muestra aprobada; D-200 = detalle menor del ejecutor.
 */
export const walkthroughEs = {
  title: 'Walkthrough', // APROBADO (muestras ronda 8, 10 y 12)
  start: 'Hacer walkthrough', // D-200: botón de contorno en la pestaña Sitios
  siteDone: 'Walkthrough hecho', // APROBADO (estado del flujo): línea gris del sitio con walkthrough cerrado
  startSite: 'Sitio', // APROBADO (muestra ronda 9, mismo paso de elegir sitio)
  startContinue: 'Continuar', // APROBADO (muestra ronda 9)
  closedAlready: 'Este sitio ya tiene un walkthrough cerrado.', // D-200
  errorStart: 'No se pudo abrir el walkthrough. Inténtalo otra vez.', // D-200
  missing: 'Este walkthrough no está en este teléfono.', // D-200
  stepLine: (n: number, name: string) => `Paso ${n} de 5 · ${name}`, // APROBADO (D-073)
  steps: {
    site: 'Sitio y contacto', // APROBADO (D-073)
    areas: 'Áreas', // APROBADO (D-073)
    frequency: 'Frecuencia', // APROBADO (D-073)
    internal: 'Notas internas', // APROBADO (D-073)
    summary: 'Resumen', // APROBADO (D-073)
  },
  back: 'Atrás', // APROBADO (D-073)
  next: 'Siguiente', // APROBADO (D-073)
  pending: (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`), // APROBADO (D-091: "3 pendientes")
  synced: 'Sincronizado', // APROBADO (D-119)

  site: {
    address: 'Dirección', // APROBADO (flujo: dirección)
    contact: 'Persona de contacto', // APROBADO (flujo)
    phone: 'Teléfono', // D-200
    email: 'Email', // D-200
    general: 'Datos generales del lugar', // APROBADO (flujo: datos generales del lugar)
  },

  areas: {
    add: 'Agregar área', // D-200: botón de contorno bajo la lista
    empty: 'Todavía no hay áreas.', // D-200
    newTitle: 'Nueva área', // APROBADO (muestras ronda 3 y 8)
    type: 'Tipo', // APROBADO (D-037, D-074)
    name: 'Nombre', // APROBADO (D-037, D-074)
    size: 'Tamaño (ft²)', // APROBADO (D-037; la unidad sale de la muestra "120 ft²")
    condition: 'Condición', // D-200: etiqueta del control segmentado
    specialRequest: 'Pedido especial', // APROBADO (D-074)
    notes: 'Notas', // APROBADO (D-074)
    photo: 'Foto', // APROBADO (D-037)
    saveAndNext: 'Guardar y otra', // APROBADO (D-037)
  },

  photos: {
    heading: (area: string) => `Fotos de ${area}`, // APROBADO (muestra ronda 3)
    take: 'Tomar foto', // APROBADO (D-039)
    empty: 'Todavía no hay fotos.', // D-200
    noteTitle: 'Nota de la foto', // D-200
    note: 'Nota', // D-200
    noPhotoHere: 'Foto guardada en el servidor', // D-200: miniatura de una foto que no está en este teléfono
    cameraDenied: 'Permite el acceso a la cámara en los ajustes del teléfono.', // APROBADO (D-195)
    errorPhoto: 'No se pudo guardar la foto. Inténtalo otra vez.', // D-200
  },

  frequency: {
    type: 'Tipo', // APROBADO (D-075)
    daily: 'Diaria', // APROBADO (D-105)
    weekly: 'Semanal', // APROBADO (muestra ronda 8)
    other: 'Otra', // APROBADO (D-080)
    describe: 'Describe la frecuencia', // APROBADO (D-080)
    times: (n: number) => (n === 1 ? '1 vez por semana' : `${n} veces por semana`), // APROBADO (D-075, D-105: "3 veces por semana")
    noDays: 'Marca los días del servicio.', // D-200
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // APROBADO (D-038)
  },

  internal: {
    note: 'No salen al cliente.', // APROBADO (flujo: "notas internas (no salen al cliente)")
    staff: 'Personal necesario', // APROBADO (flujo)
    time: 'Tiempo estimado', // APROBADO (flujo)
    supplies: 'Suministros', // APROBADO (flujo)
  },

  summary: {
    close: 'Cerrar walkthrough', // APROBADO (D-212)
    closePending: 'Se cerrará cuando haya conexión.', // D-200: el cierre quedó en la cola
    closedLine: (n: number) => `Versión ${n} cerrada.`, // D-200
    editingLine: (n: number) => `Corrigiendo la versión ${n}: al cerrar se guarda la versión ${n + 1}.`, // D-200
    viewPdf: 'Ver PDF', // D-200 (D-212: PDF descargable desde el Resumen cerrado)
    pdfTitle: (company: string) => `Walkthrough · ${company}`, // D-200: título del visor
    editSection: (section: string) => `Editar ${section}`, // D-200: solo lo lee el lector de pantalla
    noAreas: 'Sin áreas.', // D-200
    empty: '—', // D-200
  },
  remove: {
    areaTitle: (area: string) => `¿Eliminar ${area}?`, // D-200 (D-212: papelera con confirmación)
    areaBody: 'Se borran también sus fotos.', // D-200
    photoTitle: '¿Eliminar esta foto?', // D-200
    delete: 'Eliminar', // APROBADO (mismo botón de D-201)
    areaLabel: (area: string) => `Eliminar ${area}`, // D-200: solo lo lee el lector de pantalla
    photoLabel: 'Eliminar foto', // D-200: solo lo lee el lector de pantalla
  },
  home: {
    row: 'Walkthroughs en curso', // APROBADO (D-212)
    count: (n: number) => (n === 1 ? '1 en curso' : `${n} en curso`), // D-200
  },

  types: {
    bathroom: 'Baño',
    office: 'Oficina',
    lobby: 'Lobby',
    kitchen: 'Cocina',
    conference: 'Sala de juntas',
    hallway: 'Pasillo',
    reception: 'Recepción',
    stairs: 'Escaleras',
    storage: 'Almacén',
    other: 'Otro',
  } satisfies Record<AreaType, string>, // APROBADO (D-106)
  conditions: { good: 'Buena', fair: 'Regular', poor: 'Mala' } satisfies Record<Condition, string>, // APROBADO (D-037)
};

export type WalkthroughStrings = typeof walkthroughEs;

/** English (D-157), translated with the screen and purpose of each text; not yet reviewed by the owner. */
export const walkthroughEn: WalkthroughStrings = {
  title: 'Walkthrough',
  start: 'Do walkthrough', // Sites tab: outline button
  siteDone: 'Walkthrough done',
  startSite: 'Site',
  startContinue: 'Continue',
  closedAlready: 'This site already has a closed walkthrough.',
  errorStart: "Couldn't open the walkthrough. Try again.",
  missing: "This walkthrough isn't on this phone.",
  stepLine: (n: number, name: string) => `Step ${n} of 5 · ${name}`,
  steps: { site: 'Site and contact', areas: 'Areas', frequency: 'Frequency', internal: 'Internal notes', summary: 'Summary' },
  back: 'Back',
  next: 'Next',
  pending: (n: number) => `${n} pending`, // header: items waiting to sync
  synced: 'Synced',
  site: { address: 'Address', contact: 'Contact person', phone: 'Phone', email: 'Email', general: 'General site details' },
  areas: {
    add: 'Add area',
    empty: 'No areas yet.',
    newTitle: 'New area',
    type: 'Type',
    name: 'Name',
    size: 'Size (sq ft)',
    condition: 'Condition',
    specialRequest: 'Special request',
    notes: 'Notes',
    photo: 'Photo',
    saveAndNext: 'Save and add another',
  },
  photos: {
    heading: (area: string) => `Photos of ${area}`,
    take: 'Take photo',
    empty: 'No photos yet.',
    noteTitle: 'Photo note',
    note: 'Note',
    noPhotoHere: 'Photo saved on the server',
    cameraDenied: "Allow camera access in the phone's settings.",
    errorPhoto: "Couldn't save the photo. Try again.",
  },
  frequency: {
    type: 'Type',
    daily: 'Daily',
    weekly: 'Weekly',
    other: 'Other',
    describe: 'Describe the frequency',
    times: (n: number) => (n === 1 ? 'Once a week' : `${n} times a week`),
    noDays: 'Mark the service days.',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  internal: { note: "Not shared with the client.", staff: 'Staff needed', time: 'Estimated time', supplies: 'Supplies' },
  summary: {
    close: 'Close walkthrough',
    closePending: 'It will close when there is a connection.',
    closedLine: (n: number) => `Version ${n} closed.`,
    editingLine: (n: number) => `Correcting version ${n}: closing saves version ${n + 1}.`,
    viewPdf: 'View PDF',
    pdfTitle: (company: string) => `Walkthrough · ${company}`,
    editSection: (section: string) => `Edit ${section}`,
    noAreas: 'No areas.',
    empty: '—',
  },
  remove: {
    areaTitle: (area: string) => `Delete ${area}?`,
    areaBody: 'Its photos are deleted too.',
    photoTitle: 'Delete this photo?',
    delete: 'Delete',
    areaLabel: (area: string) => `Delete ${area}`,
    photoLabel: 'Delete photo',
  },
  home: {
    row: 'Walkthroughs in progress', // admin home row built from what is saved on the phone
    count: (n: number) => `${n} in progress`,
  },
  types: {
    bathroom: 'Bathroom',
    office: 'Office',
    lobby: 'Lobby',
    kitchen: 'Kitchen',
    conference: 'Conference room',
    hallway: 'Hallway',
    reception: 'Reception',
    stairs: 'Stairs',
    storage: 'Storage room',
    other: 'Other',
  },
  conditions: { good: 'Good', fair: 'Fair', poor: 'Poor' },
};

export function getWalkthroughStrings(locale: Locale): WalkthroughStrings {
  return locale === 'es' ? walkthroughEs : walkthroughEn;
}
