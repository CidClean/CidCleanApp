import type { Locale } from './index';

/**
 * Textos de los días de servicio de los 1099 y de la ubicación obligatoria de los W-2 (órdenes 53 y 54).
 * APROBADO = de `surveys/dias-servicio-aprobado.html` (D-286) o de la decisión citada; D-200 = detalle menor.
 */
export const serviceDaysEs = {
  // Inicio del 1099 (D-286 (1))
  today: 'Hoy', // APROBADO (D-286)
  accessWindow: (from: string, to: string) => `Franja de acceso del cliente: ${from} – ${to}`, // APROBADO (D-275, D-286)
  todayWindow: (from: string, to: string) => `Hoy · Franja de acceso del cliente: ${from} – ${to}`, // APROBADO (D-286)
  markCompleted: 'Marcar como completado', // APROBADO (D-286)
  markAgain: 'Marcar de nuevo como completado', // APROBADO (D-286)
  sentPending: 'Marcado como completado · pendiente de aprobación', // D-200
  approvedToday: 'Completado correctamente', // APROBADO (D-275: "Completado correctamente")
  noteFrom: (day: string) => `${day} · nota del admin:`, // APROBADO (D-286: "Oct 29 · nota del admin:")
  errorMark: 'No se pudo marcar. Inténtalo otra vez.', // D-200
  offlineMark: 'Sin conexión: márcalo cuando vuelvas a tener internet.', // D-200

  // Mis días de servicio (D-279, D-286 (2))
  title: 'Mis días de servicio', // APROBADO (D-279, D-286)
  summary: (month: string, approved: number, pending: number) =>
    `${month}: ${approved === 1 ? '1 aprobado' : `${approved} aprobados`} · ${pending === 1 ? '1 pendiente' : `${pending} pendientes`}`, // APROBADO (D-286: "Octubre: 12 aprobados · 1 pendiente")
  rowDetail: 'Tus días por mes', // D-200 (fila en Mi perfil)
  pending: 'Pendiente', // APROBADO (D-286)
  needsCorrection: 'Requiere corrección', // APROBADO (D-275, D-286)
  approved: 'Aprobado', // APROBADO (D-286)
  empty: 'No hay días de servicio en este mes.', // D-200
  errorLoad: 'No se pudieron cargar tus días. Inténtalo otra vez.', // D-200
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], // D-200
  note: 'Sin clock in, sin horas y sin ubicación. La fecha y el sitio se ponen solos.', // APROBADO (D-286)

  // To approve del admin (D-286 (3))
  markedAt: (time: string) => `Marcado completado ${time}`, // APROBADO (D-286)
  scheduled: 'Programada', // APROBADO (D-286)
  noAccess: 'Sin acceso a la app', // APROBADO (D-286)
  notMarked: 'No ha marcado', // D-200 (1099 con acceso que aún no marca)
  approve: 'Aprobar', // APROBADO (D-286)
  giveBack: 'Devolver', // APROBADO (D-286)
  recordApprove: 'Registrar y aprobar', // APROBADO (D-286)
  returnTitle: 'Devolver: Requiere corrección', // APROBADO (D-286)
  returnNote: 'Nota (obligatoria)', // APROBADO (D-286)
  noteRequired: 'Escribe la nota.', // D-200
  editAmount: 'Editar monto', // D-200 (D-276)
  editAmountTitle: (name: string) => `Monto del día de ${name}`, // D-200
  amountLabel: 'Monto', // D-200
  amountNote: 'Motivo (obligatorio)', // D-200 (queda en el historial, D-276)
  amountInvalid: 'Escribe un monto válido y el motivo.', // D-200
  editedChip: 'Editado', // D-200
  errorPendingDays: 'Falta aprobar a los 1099 de esta visita.', // D-200
  errorApproved: 'Ese día ya está aprobado: solo el Super Admin lo corrige.', // D-200 (D-262)
  contractorChip: '1099', // D-200

  // Estado de cuenta (D-286 (4))
  statementTitle: 'Estado de cuenta', // APROBADO (D-286)
  statementRow: 'Días de servicio de los 1099 por mes', // D-200 (fila en Accounting)
  daysApproved: (n: number) => (n === 1 ? '1 día aprobado' : `${n} días aprobados`), // APROBADO (D-286)
  daysEdited: (n: number) => (n === 1 ? '1 editado' : `${n} editados`), // APROBADO (D-286: "· 1 editado")
  fixedMonthly: (n: number) => `${n === 1 ? '1 día' : `${n} días`} · fijo mensual`, // APROBADO (D-286)
  monthly: 'mensual', // APROBADO (D-286)
  payBefore: (day: string) => `Pagar antes del ${day}`, // APROBADO (D-286)
  statementNote: '$80 por día de servicio aprobado según el pago del jobsite; un día se puede editar en casos especiales y queda en el historial.', // APROBADO (D-286)
  exportButton: 'Exportar (PDF / CSV)', // APROBADO (D-286)
  statementEmpty: 'No hay días aprobados en este mes.', // D-200
  csvHeader: ['Contratista', 'Días aprobados', 'Editados', 'Monto días', 'Fijo', 'Total', 'Pagar antes del'], // D-200
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`), // D-200 (Accounting y Estadísticas)

  // W-2: ubicación obligatoria (D-277 (2))
  locationNeeded: 'Para marcar entrada y salida necesitamos tu ubicación en ese momento. Solo se lee al marcar, nunca en segundo plano.', // D-200 (D-277)
  givePermission: 'Dar permiso de ubicación', // D-200 (D-277)
  retryLocation: 'Volver a intentar', // D-200
};

export type ServiceDaysStrings = typeof serviceDaysEs;

export const serviceDaysEn: ServiceDaysStrings = {
  today: 'Today',
  accessWindow: (from, to) => `Client access window: ${from} – ${to}`,
  todayWindow: (from, to) => `Today · Client access window: ${from} – ${to}`,
  markCompleted: 'Mark as completed',
  markAgain: 'Mark as completed again',
  sentPending: 'Marked as completed · pending approval',
  approvedToday: 'Completed correctly',
  noteFrom: (day) => `${day} · admin note:`,
  errorMark: "Couldn't mark it. Try again.",
  offlineMark: 'No connection: mark it when you are back online.',
  title: 'My service days',
  summary: (month, approved, pending) => `${month}: ${approved} approved · ${pending} pending`,
  rowDetail: 'Your days by month',
  pending: 'Pending',
  needsCorrection: 'Needs correction',
  approved: 'Approved',
  empty: 'No service days this month.',
  errorLoad: "Couldn't load your days. Try again.",
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  note: 'No clock in, no hours and no location. The date and site are filled in for you.',
  markedAt: (time) => `Marked completed ${time}`,
  scheduled: 'Scheduled',
  noAccess: 'No app access',
  notMarked: 'Not marked yet',
  approve: 'Approve',
  giveBack: 'Return',
  recordApprove: 'Record and approve',
  returnTitle: 'Return: Needs correction',
  returnNote: 'Note (required)',
  noteRequired: 'Write the note.',
  editAmount: 'Edit amount',
  editAmountTitle: (name) => `Day amount for ${name}`,
  amountLabel: 'Amount',
  amountNote: 'Reason (required)',
  amountInvalid: 'Enter a valid amount and the reason.',
  editedChip: 'Edited',
  errorPendingDays: 'The 1099s on this visit still need approval.',
  errorApproved: 'That day is already approved: only the Super Admin can correct it.',
  contractorChip: '1099',
  statementTitle: 'Statement',
  statementRow: "1099 contractors' service days by month",
  daysApproved: (n) => (n === 1 ? '1 approved day' : `${n} approved days`),
  daysEdited: (n) => `${n} edited`,
  fixedMonthly: (n) => `${n === 1 ? '1 day' : `${n} days`} · fixed monthly`,
  monthly: 'monthly',
  payBefore: (day) => `Pay before ${day}`,
  statementNote: '$80 per approved service day per the jobsite pay; a day can be edited in special cases and it is kept in the history.',
  exportButton: 'Export (PDF / CSV)',
  statementEmpty: 'No approved days this month.',
  csvHeader: ['Contractor', 'Approved days', 'Edited', 'Days amount', 'Fixed', 'Total', 'Pay before'],
  days: (n) => (n === 1 ? '1 day' : `${n} days`),
  locationNeeded: 'To clock in and out we need your location at that moment. It is only read when you clock, never in the background.',
  givePermission: 'Allow location',
  retryLocation: 'Try again',
};

export function getServiceDaysStrings(locale: Locale): ServiceDaysStrings {
  return locale === 'es' ? serviceDaysEs : serviceDaysEn;
}
