import { enqueue, loadQueue, loadShift, saveShift, setWorkStorage, syncWorkQueue, type QueueDeps } from './workQueue';
import { elapsed, formatMinutes, pickNext, pickToday, weekRange, weekWarning } from './scheduleRules';
import type { MyVisit } from './scheduleApi';

function memory() {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) };
}

describe('marcar sin internet (D-214)', () => {
  beforeEach(() => setWorkStorage(memory()));

  it('sin red queda en la cola; al volver la señal manda entrada y salida en orden con la hora del teléfono', async () => {
    let online = false;
    const calls: string[] = [];
    const deps: QueueDeps = {
      clockIn: async (p) => {
        if (!online) return { ok: false, reason: 'network' };
        calls.push(`in ${p.at.toISOString()} ${p.offline}`);
        return { ok: true, data: { id: 'e1' } };
      },
      clockOut: async (p) => {
        if (!online) return { ok: false, reason: 'network' };
        calls.push(`out ${p.entryId}`);
        return { ok: true, data: null };
      },
    };
    await saveShift({ visitId: 'v1', clientId: 'c1', entryId: null, clockIn: '2026-10-23T13:00:00.000Z', jobsite: 'Sede' });
    await enqueue({ kind: 'in', clientId: 'c1', visitId: 'v1', at: '2026-10-23T13:00:00.000Z', lat: null, lng: null });
    await enqueue({ kind: 'out', clientId: 'c1', entryId: null, at: '2026-10-23T16:00:00.000Z', lat: null, lng: null });
    expect(await syncWorkQueue(deps)).toBe('offline');
    expect(await loadQueue()).toHaveLength(2);
    online = true;
    expect(await syncWorkQueue(deps)).toBe('synced');
    expect(calls).toEqual(['in 2026-10-23T13:00:00.000Z true', 'out e1']);
    expect(await loadQueue()).toHaveLength(0);
    expect((await loadShift())?.entryId).toBe('e1');
  });

  it('un rechazo del servidor no bloquea la cola', async () => {
    const deps: QueueDeps = {
      clockIn: async () => ({ ok: false, reason: 'already_in' }),
      clockOut: async () => ({ ok: true, data: null }),
    };
    await enqueue({ kind: 'in', clientId: 'c2', visitId: 'v2', at: '2026-10-23T13:00:00.000Z', lat: null, lng: null });
    expect(await syncWorkQueue(deps)).toBe('synced');
    expect(await loadQueue()).toHaveLength(0);
  });
});

describe('reglas del schedule', () => {
  it('horas al minuto y cronómetro', () => {
    expect(formatMinutes(135)).toBe('2 h 15 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(180)).toBe('3 h');
    expect(elapsed(new Date(0), new Date(3909000))).toBe('1:05:09');
  });
  it('semana actual y siguiente de lunes a domingo (D-012, D-093)', () => {
    const r = weekRange(new Date(2026, 9, 23), 'this');
    expect(r.from).toBe('2026-10-19');
    expect(r.to).toBe('2026-10-25');
    expect(weekRange(new Date(2026, 9, 23), 'next').from).toBe('2026-10-26');
  });
  it('aviso desde 28 h y bloqueo con más de 32 h (solo para quien programa)', () => {
    expect(weekWarning(27 * 60)).toBeNull();
    expect(weekWarning(28 * 60)).toBe('warn');
    expect(weekWarning(32 * 60)).toBe('warn');
    expect(weekWarning(32 * 60 + 1)).toBe('over');
  });
  it('Inicio del staff: primero el turno abierto, si no la próxima de hoy sin marcar; Próxima después de hoy', () => {
    const now = new Date(2026, 9, 23, 12, 0);
    const v = (id: string, day: string, h: number, entry: MyVisit['entry'] = null): MyVisit => ({
      id, jobsite: id, address: '', day, startsAt: new Date(`${day}T${String(h).padStart(2, '0')}:00:00`), minutes: 60, scheduled: true, entry,
    });
    const list = [v('a', '2026-10-23', 8, { id: 'e', clockIn: new Date(), clockOut: new Date() }), v('b', '2026-10-23', 18), v('c', '2026-10-24', 8)];
    expect(pickToday(list, now)?.id).toBe('b');
    expect(pickToday([...list, v('d', '2026-10-23', 9, { id: 'f', clockIn: new Date(), clockOut: null })], now)?.id).toBe('d');
    expect(pickNext(list, now)?.id).toBe('c');
  });
});
