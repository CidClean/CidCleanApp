import { salesEn, salesEs } from '@/i18n/sales';
import {
  LEAD_STATUSES,
  activeReasons,
  canDeleteLeads,
  nextReasonSort,
  validateReasonForm,
  appointmentDayKeys,
  canEditLeads,
  canGoToPreviousMonth,
  canSeeLeads,
  checkSchedule,
  emptyLeadForm,
  formatClock,
  formatDateTime,
  formatUsDate,
  hasLeadErrors,
  leadColumns,
  leadListDetail,
  monthGrid,
  nextScheduled,
  parseTime,
  parseUsDate,
  salesPendingRows,
  shiftMonth,
  showsSalesPending,
  siteLabel,
  sortLeads,
  sortPending,
  statusChangeAction,
  statusTone,
  validateLeadForm,
  type LeadSummary,
} from './leadRules';
import { visibleTabs, type Access } from './visibility';

const access = (perms: string[], isSuperAdmin = false): Access => ({ isSuperAdmin, permissions: new Set(perms) });

describe('quién ve y edita leads (current/permisos.md, D-169)', () => {
  it('Pipeline aparece con cualquier permiso de Ventas (D-132), pero la lista pide leads_ver', () => {
    const quotes = access(['quotes_ver']);
    expect(visibleTabs(quotes)).toContain('pipeline');
    expect(canSeeLeads(quotes)).toBe(false);
    expect(canSeeLeads(access(['leads_ver']))).toBe(true);
  });

  it('crear y editar piden leads_ver y leads_editar', () => {
    expect(canEditLeads(access(['leads_ver']))).toBe(false);
    expect(canEditLeads(access(['leads_editar']))).toBe(false);
    expect(canEditLeads(access(['leads_ver', 'leads_editar']))).toBe(true);
  });

  it('el Super Admin puede todo; sin permisos, nada', () => {
    expect(canEditLeads(access([], true))).toBe(true);
    expect(canSeeLeads(access([]))).toBe(false);
    expect(showsSalesPending(access([]))).toBe(false);
  });

  it('el Supervisor de partida (leads_ver) ve leads y sus pendientes pero no edita', () => {
    const supervisor = access(['leads_ver', 'walkthroughs_hacer', 'clientes_ver']);
    expect(canSeeLeads(supervisor)).toBe(true);
    expect(showsSalesPending(supervisor)).toBe(true);
    expect(canEditLeads(supervisor)).toBe(false);
  });
});

describe('estados del lead (flujo, D-071, D-079)', () => {
  it('son los ocho del flujo, en su orden', () => {
    expect(LEAD_STATUSES.map((k) => salesEs.status[k])).toEqual([
      'Nuevo',
      'Contactado',
      'Walkthrough agendado',
      'Walkthrough hecho',
      'Quote enviado',
      'Negociación',
      'Ganado',
      'Perdido',
    ]);
  });

  it('elegir Perdido pide el motivo; el mismo estado no hace nada; los demás se guardan', () => {
    expect(statusChangeAction('contacted', 'lost')).toBe('askLostReason');
    expect(statusChangeAction('lost', 'lost')).toBe('none');
    expect(statusChangeAction('new', 'contacted')).toBe('save');
    expect(statusChangeAction('lost', 'negotiation')).toBe('save');
  });

  it('ficha: de marca abierto, verde Ganado, gris Perdido', () => {
    expect(statusTone('walkthrough_scheduled')).toBe('brand');
    expect(statusTone('won')).toBe('success');
    expect(statusTone('lost')).toBe('neutral');
  });
});

describe('formulario del lead', () => {
  it('la empresa es obligatoria; email y fecha se validan solo si se escriben', () => {
    expect(validateLeadForm(emptyLeadForm)).toEqual({ company: true });
    const ok = { ...emptyLeadForm, company: 'Gulf Coast Dental' };
    expect(hasLeadErrors(validateLeadForm(ok))).toBe(false);
    expect(validateLeadForm({ ...ok, email: 'ana@' })).toEqual({ email: true });
    expect(validateLeadForm({ ...ok, followUp: '13/40/2026' })).toEqual({ followUp: true });
    // D-216: teléfono de EE. UU. de 10 dígitos, guardado como (239) 555-0142.
    expect(validateLeadForm({ ...ok, phone: '(239) 555-01' })).toEqual({ phone: true });
    expect(hasLeadErrors(validateLeadForm({ ...ok, phone: '(239) 555-0142' }))).toBe(false);
    expect(leadColumns({ ...ok, phone: '239.555.0142' }).phone).toBe('(239) 555-0142');
  });

  it('parte con fuente Manual y limpia los textos al guardar', () => {
    expect(emptyLeadForm.source).toBe('manual');
    expect(
      leadColumns({ ...emptyLeadForm, company: '  Gulf  ', email: ' Ana@X.com ', phone: ' ', notes: 'n' }),
    ).toEqual({ company: 'Gulf', contact_name: null, phone: null, email: 'ana@x.com', source: 'manual', notes: 'n', language: 'en' });
  });

  it('idioma del cliente: inglés por defecto y se guarda el elegido (D-209)', () => {
    expect(emptyLeadForm.language).toBe('en');
    expect(leadColumns({ ...emptyLeadForm, company: 'X', language: 'es' }).language).toBe('es');
  });

  it('fechas MM/DD/AAAA', () => {
    expect(parseUsDate('10/24/2026')).toBe('2026-10-24');
    expect(parseUsDate('1/5/2027')).toBe('2027-01-05');
    expect(parseUsDate('')).toBeNull();
    expect(parseUsDate('02/30/2026')).toBe('invalid');
    expect(parseUsDate('2026-10-24')).toBe('invalid');
    expect(formatUsDate('2026-10-24')).toBe('10/24/2026');
    expect(formatUsDate(null)).toBe('');
  });
});

describe('hora del walkthrough (D-072)', () => {
  it.each([
    ['10:00 AM', 10, 0],
    ['10 am', 10, 0],
    ['2:30pm', 14, 30],
    ['2:30 p. m.', 14, 30],
    ['12:15 AM', 0, 15],
    ['12:00 PM', 12, 0],
    ['14:30', 14, 30],
  ])('lee "%s"', (text, hours, minutes) => {
    expect(parseTime(text)).toEqual({ hours, minutes });
  });

  it.each(['', '25:00', '13:00 PM', '10:75', 'diez'])('rechaza "%s"', (text) => {
    expect(parseTime(text)).toBeNull();
  });

  it('se muestra como 10:00 AM en los dos idiomas', () => {
    expect(formatClock(10, 0)).toBe('10:00 AM');
    expect(formatClock(0, 5)).toBe('12:05 AM');
    expect(formatClock(13, 30)).toBe('1:30 PM');
  });

  it('no deja agendar con hora inválida ni en el pasado', () => {
    const now = new Date(2026, 9, 21, 15, 0);
    expect(checkSchedule('2026-10-21', 'x', now)).toEqual({ ok: false, error: 'time' });
    expect(checkSchedule('2026-10-21', '2:00 PM', now)).toEqual({ ok: false, error: 'past' });
    const ok = checkSchedule('2026-10-22', '10:00 AM', now);
    expect(ok.ok && ok.startsAt.getTime()).toBe(new Date(2026, 9, 22, 10, 0).getTime());
  });
});

describe('calendario del mes (D-104)', () => {
  const today = new Date(2026, 9, 21);

  it('octubre de 2026 empieza en el lunes 28 de septiembre y termina el domingo 1 de noviembre (muestra ronda 12)', () => {
    const weeks = monthGrid(2026, 9, today, new Set(), null);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toMatchObject({ key: '2026-09-28', day: 28, inMonth: false });
    expect(weeks[0][3]).toMatchObject({ key: '2026-10-01', inMonth: true });
    expect(weeks[4][6]).toMatchObject({ key: '2026-11-01', inMonth: false });
  });

  it('marca los días con citas, el elegido y los pasados', () => {
    const busy = appointmentDayKeys([new Date(2026, 9, 22, 10), new Date(2026, 9, 27, 9)]);
    const cells = monthGrid(2026, 9, today, busy, '2026-10-22').flat();
    const byKey = (k: string) => cells.find((c) => c.key === k)!;
    expect(byKey('2026-10-22')).toMatchObject({ hasAppointment: true, selected: true, past: false });
    expect(byKey('2026-10-27').hasAppointment).toBe(true);
    expect(byKey('2026-10-20').past).toBe(true);
    expect(byKey('2026-10-21').past).toBe(false);
    expect(cells.filter((c) => c.selected)).toHaveLength(1);
  });

  it('un mes que empieza en lunes no lleva días del mes anterior; uno largo usa 6 semanas', () => {
    expect(monthGrid(2027, 2, today, new Set(), null)[0][0].key).toBe('2027-03-01');
    expect(monthGrid(2026, 7, today, new Set(), null)).toHaveLength(6); // agosto 2026 empieza en sábado
  });

  it('flechas: cambian de año y no vuelven a meses pasados', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2027, 0, -1)).toEqual({ year: 2026, month: 11 });
    expect(canGoToPreviousMonth(2026, 9, today)).toBe(false);
    expect(canGoToPreviousMonth(2026, 10, today)).toBe(true);
  });
});

describe('lista del Pipeline', () => {
  const base: LeadSummary = {
    id: '1',
    company: 'Gulf Coast Dental',
    contactName: 'Ana Rivera',
    status: 'new',
    createdAt: new Date(2026, 9, 20),
    followUpOn: null,
    nextWalkthrough: null,
  };

  it('el más reciente arriba', () => {
    const older = { ...base, id: 'a', createdAt: new Date(2026, 9, 1) };
    const newer = { ...base, id: 'b', createdAt: new Date(2026, 9, 10) };
    expect(sortLeads([older, newer]).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('línea gris: walkthrough, si no seguimiento, si no contacto (muestra ronda 1)', () => {
    const wt = { ...base, nextWalkthrough: new Date(2026, 9, 27, 10, 0), followUpOn: '2026-10-24' };
    expect(leadListDetail(wt, salesEs)).toBe('Walkthrough: Mar 27 oct · 10:00 AM');
    expect(leadListDetail(wt, salesEn)).toBe('Walkthrough: Tue, Oct 27 · 10:00 AM');
    expect(leadListDetail({ ...base, followUpOn: '2026-10-24' }, salesEs)).toBe('Seguimiento: Sáb 24 oct');
    expect(leadListDetail(base, salesEs)).toBe('Ana Rivera');
    expect(leadListDetail({ ...wt, status: 'lost' }, salesEs)).toBe('Ana Rivera');
  });

  it('próxima cita: solo agendadas y desde ahora', () => {
    const now = new Date(2026, 9, 21, 12);
    expect(
      nextScheduled(
        [
          { id: 'a', startsAt: new Date(2026, 9, 20), status: 'scheduled' },
          { id: 'b', startsAt: new Date(2026, 9, 25), status: 'scheduled' },
          { id: 'c', startsAt: new Date(2026, 9, 23), status: 'canceled' },
          { id: 'd', startsAt: new Date(2026, 9, 24), status: 'scheduled' },
        ],
        now,
      ),
    ).toEqual(new Date(2026, 9, 24));
  });

  it('fecha y hora, y nombre del sitio', () => {
    expect(formatDateTime(new Date(2026, 9, 22, 10, 0), salesEs)).toBe('Jue 22 oct · 10:00 AM');
    expect(siteLabel({ name: null, address: '123 5th Ave S' })).toBe('123 5th Ave S');
    expect(siteLabel({ name: '5th Ave S', address: '123 5th Ave S' })).toBe('5th Ave S');
  });
});

describe('pendientes del Inicio (D-111, D-131)', () => {
  const counts = { followUpsDue: 3, walkthroughsUpcoming: 1 };

  it('con leads_ver: seguimientos y walkthroughs, con flecha (no son Urgentes)', () => {
    const rows = salesPendingRows(access(['leads_ver']), counts, salesEs);
    expect(rows).toEqual([
      { key: 'followUps', title: 'Seguimientos de leads', detail: '3 pendientes', urgent: false },
      { key: 'walkthroughs', title: 'Walkthroughs agendados', detail: '1 agendado', urgent: false },
    ]);
  });

  it('sin leads_ver no hay pendientes de Ventas aunque haya otros permisos de Ventas', () => {
    expect(salesPendingRows(access(['walkthroughs_hacer', 'quotes_ver']), counts, salesEs)).toEqual([]);
  });

  it('en cero no aparece la fila; sin datos, nada', () => {
    expect(salesPendingRows(access(['leads_ver']), { followUpsDue: 0, walkthroughsUpcoming: 2 }, salesEs).map((r) => r.key)).toEqual([
      'walkthroughs',
    ]);
    expect(salesPendingRows(access(['leads_ver']), null, salesEs)).toEqual([]);
  });

  it('una sola lista: las Urgentes primero y, entre iguales, el orden de llegada', () => {
    const rows = [
      { id: 'a', urgent: false },
      { id: 'b', urgent: true },
      { id: 'c', urgent: false },
    ];
    expect(sortPending(rows).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('en inglés', () => {
    expect(salesPendingRows(access([], true), { followUpsDue: 1, walkthroughsUpcoming: 2 }, salesEn).map((r) => r.detail)).toEqual([
      '1 pending',
      '2 scheduled',
    ]);
  });
});

describe('eliminar lead y motivos (D-201, D-203)', () => {
  it('eliminar pide leads_ver y leads_eliminar', () => {
    expect(canDeleteLeads(access(['leads_ver', 'leads_editar']))).toBe(false);
    expect(canDeleteLeads(access(['leads_eliminar']))).toBe(false);
    expect(canDeleteLeads(access(['leads_ver', 'leads_eliminar']))).toBe(true);
    expect(canDeleteLeads(access([], true))).toBe(true);
  });

  const r = (id: string, sort: number, active = true) => ({ id, labelEs: id, labelEn: id, sort, active });

  it('se ofrecen y cuentan solo los activos, en su orden', () => {
    expect(activeReasons([r('b', 2), r('a', 1), r('x', 3, false)]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('un motivo nuevo va al final, también después de los desactivados', () => {
    expect(nextReasonSort([r('a', 1), r('x', 9, false)])).toBe(10);
    expect(nextReasonSort([])).toBe(1);
  });

  it('cada motivo lleva español e inglés', () => {
    expect(validateReasonForm({ labelEs: ' ', labelEn: '' })).toEqual({ labelEs: true, labelEn: true });
    expect(validateReasonForm({ labelEs: 'Precio', labelEn: 'Price' })).toEqual({});
  });
});
