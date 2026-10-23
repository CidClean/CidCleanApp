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
  hours: { h: 'h', min: 'min' }, // D-200
  people: (n: number) => (n === 1 ? '1 persona' : `${n} personas`), // D-200
  nothingToApprove: 'No hay trabajos por aprobar.', // D-200

  // Visita (editar hora, duración y personal)
  visitTitle: 'Visita', // D-200
  newVisit: 'Nueva visita', // D-200
  jobsite: 'Jobsite', // APROBADO (flujo)
  day: 'Día', // D-200
  time: 'Hora', // APROBADO (D-072)
  duration: 'Duración (min)', // D-200
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
  errorDuration: 'Escribe la duración en minutos, de 15 a 1440.', // D-200
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
  jobsiteDuration: 'Duración de cada visita (min)', // D-200 (D-214)
  jobsiteTimeNote: 'Las visitas se generan 4 semanas por adelantado según la frecuencia.', // D-200 (D-214)
  jobsiteNoTime: 'Pon la hora y la duración para generar las visitas.', // D-200
  jobsiteOther: 'Frecuencia Otra: las visitas se agregan a mano en Schedule y Work.', // D-200 (D-214)
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
  hours: { h: 'h', min: 'min' },
  people: (n: number) => (n === 1 ? '1 person' : `${n} people`),
  nothingToApprove: 'Nothing to approve.',
  visitTitle: 'Visit',
  newVisit: 'New visit',
  jobsite: 'Jobsite',
  day: 'Day',
  time: 'Time',
  duration: 'Duration (min)',
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
  errorDuration: 'Enter the duration in minutes, 15 to 1440.',
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
  jobsiteDuration: 'Length of each visit (min)',
  jobsiteTimeNote: 'Visits are generated 4 weeks ahead from the frequency.',
  jobsiteNoTime: 'Set the time and length to generate visits.',
  jobsiteOther: 'Frequency Other: visits are added by hand in Schedule & Work.',
};

export function getWorkStrings(locale: Locale): WorkStrings {
  return locale === 'es' ? workEs : workEn;
}
