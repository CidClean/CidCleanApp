import type { Locale } from './index';

/**
 * Textos del Schedule y Work (hito 6). APROBADO = de una decisión o muestra aprobada; D-200 = detalle menor del
 * ejecutor (listado en el reporte del hito 6).
 */
export const workEs = {
  title: 'Schedule y Work', // APROBADO (D-134)
  tabSchedule: 'Schedule', // APROBADO (flujo)
  tabApprove: 'Por aprobar', // APROBADO (D-053)
  thisWeek: 'Esta semana', // APROBADO (D-093)
  nextWeek: 'Próxima semana', // APROBADO (D-093)
  previousWeek: 'Semana anterior', // D-200: flecha (lector de pantalla)
  followingWeek: 'Semana siguiente', // D-200
  noVisits: 'Sin visitas.', // D-200
  noStaff: 'Sin personal programado', // D-200
  approved: 'Aprobado', // D-200
  pendingChip: 'Pendiente', // APROBADO (D-053)
  urgent: 'Urgente', // APROBADO (D-131)
  gpsOut: 'GPS fuera de rango', // APROBADO (D-054)
  noLocation: 'Sin ubicación', // APROBADO (D-214)
  offline: 'Sin conexión', // D-200 (D-214: marcado sin internet)
  unscheduled: 'No programado', // D-200 (D-214)
  manual: 'Registrado por otro', // D-200 (D-052)
  open: 'Turno abierto', // D-200 (D-214)
  hours: { h: 'h' }, // D-231: duraciones en horas
  people: (n: number) => (n === 1 ? '1 persona' : `${n} personas`), // D-200
  nothingToApprove: 'No hay trabajos por aprobar.', // D-200

  // Visita (editar hora, duración y personal)
  visitTitle: 'Visita', // D-200
  newVisit: 'Nueva visita', // D-200
  jobsite: 'Jobsite', // APROBADO (flujo)
  day: 'Día', // D-200
  time: 'Hora', // APROBADO (D-072)
  duration: 'Duración', // D-200 (D-231: en horas)
  staff: 'Personal', // APROBADO (D-055)
  weekHours: (h: string) => `${h} esta semana`, // D-200 (solo para quien programa; el staff no lo ve, D-223)
  warn28: (names: string) => `${names}: 28 h o más esta semana.`, // D-200 (D-214: aviso desde 28 h)
  over32: (name: string) => `${name} pasaría de 32 h esta semana: no se puede programar.`, // D-200 (D-214)
  save: 'Guardar', // APROBADO (D-052)
  deleteVisit: 'Quitar visita', // D-200 (D-011: una visita que no se hará se quita)
  deleteTitle: '¿Quitar esta visita?', // D-200
  deleteBody: 'Se quita del schedule. Las visitas no se marcan como no realizadas.', // D-200 (D-011)
  confirmDelete: 'Quitar', // D-200
  errorLoad: 'No se pudo cargar el schedule. Inténtalo otra vez.', // D-200
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
  errorWorked: 'Esta visita ya tiene trabajo registrado.', // D-200
  errorDuration: 'Elige la hora y la duración (de 0.25 h a 24 h).', // D-200 (D-231)
  registerOthers: 'Registrar trabajo', // D-200 (D-052)
  addPerson: 'Agregar persona', // D-200

  // Detalle por aprobar (D-109)
  workTitle: 'Trabajo', // D-200
  summary: (people: string, hours: string) => `${people} · ${hours} en total`, // D-200 (D-109: resumen)
  entryLine: (from: string, to: string) => `${from} a ${to}`, // APROBADO (muestra ronda 14: "6:00 PM a 9:00 PM")
  stillIn: 'sigue adentro', // D-200
  approve: 'Aprobar', // APROBADO (D-109)
  reviewGps: 'Marcar GPS revisado', // D-200 (D-214)
  gpsReviewed: 'GPS revisado', // D-200
  editHours: (name: string) => `Horas de ${name}`, // D-200: título de la ventana del lápiz
  clockInLabel: 'Entrada', // D-200 (D-052)
  clockOutLabel: 'Salida', // D-200 (D-052)
  noOut: 'Sin salida', // D-200
  errorOpen: 'Hay un turno abierto: ciérralo antes de aprobar.', // D-200
  errorGps: 'Falta revisar el GPS fuera de rango.', // D-200 (D-214)
  errorHours: 'La salida debe ser después de la entrada.', // D-200
  distance: (m: number) => `A ${m} m del sitio`, // D-200

  // Staff (D-049 a D-051, D-165)
  locationReady: 'Ubicación lista', // APROBADO (D-049)
  locating: 'Buscando ubicación…', // D-200
  awayTitle: (m: number) => `Estás a ${m} m del sitio`, // APROBADO (D-051)
  retryLocation: 'Reintentar ubicación', // APROBADO (D-051)
  markAnyway: 'Marcar de todos modos', // APROBADO (D-051)
  clockedInAt: (t: string) => `Entrada ${t}`, // APROBADO (D-050: hora de entrada)
  clockOut: 'Marcar salida', // APROBADO (D-050)
  savedOffline: 'Sin conexión: se guardó en el teléfono y se enviará después.', // D-200 (D-214)
  errorClock: 'No se pudo marcar. Inténtalo otra vez.', // D-200
  notToday: 'Esta visita no es de hoy.', // D-200
  dayVisits: 'Visitas del día', // D-200 (D-165: tocar un día muestra sus visitas)
  done: 'Marcado', // D-200

  // Inicio del admin (D-111, D-214)
  homeApprove: (n: number) => (n === 1 ? '1 trabajo por aprobar' : `${n} trabajos por aprobar`), // APROBADO (D-223: "3 trabajos por aprobar")
  homeGps: (n: number) => (n === 1 ? '1 GPS fuera de rango' : `${n} GPS fuera de rango`), // D-200
  homeForgot: (n: number) => (n === 1 ? '1 entrada sin marcar' : `${n} entradas sin marcar`), // D-200 (D-214: a los 30 min)
  homeOpen: (n: number) => (n === 1 ? '1 turno abierto' : `${n} turnos abiertos`), // D-200 (D-214)

  // Horario del jobsite
  jobsiteTime: 'Hora de las visitas', // D-200 (D-214)
  jobsiteDuration: 'Duración de cada visita', // D-200 (D-231: en horas)
  jobsiteTimeNote: 'La hora y la duración se usan al armar cada semana en Schedule y Work → Semana.', // D-200 (D-232)
  jobsiteNoTime: 'Pon la hora y la duración para poder armar sus semanas.', // D-200 (D-232)
  jobsiteOther: 'Frecuencia Otra: en Schedule y Work → Semana se puede marcar cualquier día.', // D-200 (D-232)

  // Vistas del Schedule (D-231, orden 23)
  viewList: 'Lista', // APROBADO (orden 23, D-231)
  viewTable: 'Tabla', // APROBADO (orden 23, D-231)
  viewCalendar: 'Calendario', // APROBADO (orden 23, D-231)
  byEmployee: 'Empleado → días', // APROBADO (D-231)
  byDay: 'Día → empleados', // APROBADO (D-231)
  employee: 'Empleado', // D-200: encabezado de la primera columna
  unstaffed: 'Sin personal', // D-200: fila de visitas sin personal en la tabla
  share: 'Compartir', // APROBADO (D-231)
  shareSoon: 'Compartir llega con la versión 1.3.0 de la app.', // D-200 (en el APK 1.2.0 no está el módulo)
  shareError: 'No se pudo compartir. Inténtalo otra vez.', // D-200
  pdfTitle: 'Horario semanal', // D-200: título del PDF
  calDay: 'Día', // APROBADO (D-231)
  cal3: '3 días', // APROBADO (D-231)
  calWeek: 'Semana', // APROBADO (D-231)
  calMonth: 'Mes', // APROBADO (D-231)
  previous: 'Anterior', // D-200: flecha (lector de pantalla)
  next: 'Siguiente', // D-200
  more: (n: number) => `+${n}`, // D-200: más visitas en un día del mes

  // Modos del Schedule (D-232, surveys/schedule-simple-aprobado.html)
  modeSimple: 'Simple', // APROBADO (D-232)
  modeWeek: 'Semana', // APROBADO (D-232, orden 24: reemplaza "Equipos fijos")
  modeDetail: 'Detallado', // APROBADO (D-232)
  rangeToday: 'Hoy', // APROBADO (muestra D-232)
  range3: '3 días', // APROBADO (muestra D-232)
  rangeWeek: 'Semana', // APROBADO (muestra D-232)
  todayPrefix: 'Hoy · ', // APROBADO (muestra D-232)
  jobsitesCount: (n: number) => (n === 1 ? '1 jobsite' : `${n} jobsites`), // APROBADO (muestra D-232)
  noVisitsDay: 'Sin visitas', // APROBADO (muestra D-232)
  missingStaff: 'Falta asignar personal', // APROBADO (D-232)
  changeWho: (site: string) => `Cambiar quién va a ${site}`, // APROBADO (muestra D-232, lector de pantalla)
  cancel: 'Cancelar', // APROBADO (muestra D-232)
  weekHint: 'toca para marcar quién va cada día', // APROBADO (muestra D-232)
  saveWeek: 'Guardar semana', // D-200
  copyPrevious: 'Copiar semana anterior', // D-200 (orden 24)
  weekSaved: 'Semana guardada.', // D-200
  weekEmpty: 'Esta semana todavía no está guardada: marca quién va y guarda.', // D-200 (D-232: sin guardar se ve vacía)
  noTimeSite: 'Pon la hora y la duración en la pestaña Horario del jobsite para armar su semana.', // D-200
  noPeopleSite: 'Nadie asignado a este jobsite. Agrega a alguien para armar su semana.', // D-200
  noDay: (site: string, day: string) => `${site} no tiene visita el ${day}`, // APROBADO (muestra D-232, lector de pantalla)
  weekNote: 'Lo que guardes crea las visitas de esa semana. Los cambios de un día puntual se hacen tocando la tarjeta en Simple.', // D-200 (muestra D-232, sin generación 4 semanas)
  unsaved: 'Hay cambios sin guardar.', // D-200
};

export type WorkStrings = typeof workEs;

export const workEn: WorkStrings = {
  title: 'Schedule & Work',
  tabSchedule: 'Schedule',
  tabApprove: 'To approve',
  thisWeek: 'This week',
  nextWeek: 'Next week',
  previousWeek: 'Previous week',
  followingWeek: 'Following week',
  noVisits: 'No visits.',
  noStaff: 'No staff scheduled',
  approved: 'Approved',
  pendingChip: 'Pending',
  urgent: 'Urgent',
  gpsOut: 'GPS out of range',
  noLocation: 'No location',
  offline: 'Offline',
  unscheduled: 'Not scheduled',
  manual: 'Recorded by someone else',
  open: 'Shift open',
  hours: { h: 'h' },
  people: (n: number) => (n === 1 ? '1 person' : `${n} people`),
  nothingToApprove: 'Nothing to approve.',
  visitTitle: 'Visit',
  newVisit: 'New visit',
  jobsite: 'Jobsite',
  day: 'Day',
  time: 'Time',
  duration: 'Length',
  staff: 'Staff',
  weekHours: (h: string) => `${h} this week`,
  warn28: (names: string) => `${names}: 28 h or more this week.`,
  over32: (name: string) => `${name} would go over 32 h this week: can't be scheduled.`,
  save: 'Save',
  deleteVisit: 'Remove visit',
  deleteTitle: 'Remove this visit?',
  deleteBody: 'It is removed from the schedule. Visits are never marked as not done.',
  confirmDelete: 'Remove',
  errorLoad: "Couldn't load the schedule. Try again.",
  errorSave: "Couldn't save. Try again.",
  errorWorked: 'This visit already has work recorded.',
  errorDuration: 'Choose the time and length (0.25 h to 24 h).',
  registerOthers: 'Record work',
  addPerson: 'Add person',
  workTitle: 'Work',
  summary: (people: string, hours: string) => `${people} · ${hours} total`,
  entryLine: (from: string, to: string) => `${from} to ${to}`,
  stillIn: 'still in',
  approve: 'Approve',
  reviewGps: 'Mark GPS reviewed',
  gpsReviewed: 'GPS reviewed',
  editHours: (name: string) => `${name}'s hours`,
  clockInLabel: 'In',
  clockOutLabel: 'Out',
  noOut: 'No clock out',
  errorOpen: 'There is an open shift: close it before approving.',
  errorGps: 'The out-of-range GPS still needs review.',
  errorHours: 'Clock out must be after clock in.',
  distance: (m: number) => `${m} m from the site`,
  locationReady: 'Location ready',
  locating: 'Finding location…',
  awayTitle: (m: number) => `You're ${m} m from the site`,
  retryLocation: 'Retry location',
  markAnyway: 'Clock in anyway',
  clockedInAt: (t: string) => `Clocked in ${t}`,
  clockOut: 'Clock out',
  savedOffline: 'Offline: saved on the phone and will be sent later.',
  errorClock: "Couldn't clock in. Try again.",
  notToday: "This visit isn't today.",
  dayVisits: "Day's visits",
  done: 'Done',
  homeApprove: (n: number) => (n === 1 ? '1 job to approve' : `${n} jobs to approve`),
  homeGps: (n: number) => (n === 1 ? '1 GPS out of range' : `${n} GPS out of range`),
  homeForgot: (n: number) => (n === 1 ? '1 missed clock in' : `${n} missed clock ins`),
  homeOpen: (n: number) => (n === 1 ? '1 open shift' : `${n} open shifts`),
  jobsiteTime: 'Visit time',
  jobsiteDuration: 'Length of each visit',
  jobsiteTimeNote: 'The time and length are used when planning each week in Schedule & Work → Week.',
  jobsiteNoTime: 'Set the time and length to plan its weeks.',
  jobsiteOther: 'Frequency Other: any day can be marked in Schedule & Work → Week.',

  viewList: 'List',
  viewTable: 'Table',
  viewCalendar: 'Calendar',
  byEmployee: 'Employee → days',
  byDay: 'Day → employees',
  employee: 'Employee',
  unstaffed: 'No staff',
  share: 'Share',
  shareSoon: 'Sharing comes with version 1.3.0 of the app.',
  shareError: "Couldn't share. Try again.",
  pdfTitle: 'Weekly schedule',
  calDay: 'Day',
  cal3: '3 days',
  calWeek: 'Week',
  calMonth: 'Month',
  previous: 'Previous',
  next: 'Next',
  more: (n: number) => `+${n}`,

  modeSimple: 'Simple',
  modeWeek: 'Week',
  modeDetail: 'Detailed',
  rangeToday: 'Today',
  range3: '3 days',
  rangeWeek: 'Week',
  todayPrefix: 'Today · ',
  jobsitesCount: (n: number) => (n === 1 ? '1 jobsite' : `${n} jobsites`),
  noVisitsDay: 'No visits',
  missingStaff: 'Staff still needed',
  changeWho: (site: string) => `Change who goes to ${site}`,
  cancel: 'Cancel',
  weekHint: 'tap to mark who goes each day',
  saveWeek: 'Save week',
  copyPrevious: 'Copy previous week',
  weekSaved: 'Week saved.',
  weekEmpty: "This week isn't saved yet: mark who goes and save.",
  noTimeSite: "Set the visit time and length in the jobsite's Schedule tab to plan its week.",
  noPeopleSite: 'Nobody is assigned to this jobsite. Add someone to plan its week.',
  noDay: (site: string, day: string) => `${site} has no visit on ${day}`,
  weekNote: 'Saving creates that week\'s visits. One-off changes for a day are made by tapping the card in Simple.',
  unsaved: 'There are unsaved changes.',
};

export function getWorkStrings(locale: Locale): WorkStrings {
  return locale === 'es' ? workEs : workEn;
}
