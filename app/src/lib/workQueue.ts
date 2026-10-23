import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WorkResult } from './scheduleApi';

/**
 * Marcar entrada y salida sin internet (D-214): se guarda en el teléfono con la hora del teléfono y se manda después,
 * marcado para revisión. Una cola en orden; cada entrada lleva el id del teléfono para que el servidor no la duplique.
 * El turno abierto también queda en el teléfono para mostrar el cronómetro sin conexión.
 */

export type Shift = { visitId: string; clientId: string; entryId: string | null; clockIn: string; jobsite: string };
export type QueueItem =
  | { kind: 'in'; clientId: string; visitId: string; at: string; lat: number | null; lng: number | null }
  | { kind: 'out'; clientId: string; entryId: string | null; at: string; lat: number | null; lng: number | null };

type KV = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
let kv: KV = AsyncStorage;
export function setWorkStorage(next: KV): void {
  kv = next;
}

const QUEUE = 'cidclean-work-queue';
const SHIFT = 'cidclean-work-shift';

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const loadQueue = () => read<QueueItem[]>(QUEUE, []);
export const loadShift = () => read<Shift | null>(SHIFT, null);
export async function saveShift(shift: Shift | null): Promise<void> {
  if (shift) await kv.setItem(SHIFT, JSON.stringify(shift));
  else await kv.removeItem(SHIFT);
}
export async function enqueue(item: QueueItem): Promise<void> {
  const q = await loadQueue();
  await kv.setItem(QUEUE, JSON.stringify([...q, item]));
}

export type QueueDeps = {
  clockIn: (p: { visitId: string; clientId: string; at: Date; lat: number | null; lng: number | null; offline: boolean }) => Promise<WorkResult<{ id: string }>>;
  clockOut: (p: { entryId: string; at: Date; lat: number | null; lng: number | null; offline: boolean }) => Promise<WorkResult<unknown>>;
};

let running: Promise<'synced' | 'offline'> | null = null;

/** Manda lo pendiente en orden. Sin red se detiene y se reintenta después; un rechazo del servidor se descarta. */
export function syncWorkQueue(deps: QueueDeps): Promise<'synced' | 'offline'> {
  if (running) return running;
  running = (async () => {
    try {
      let q = await loadQueue();
      const ids = new Map<string, string>();
      while (q.length > 0) {
        const item = q[0];
        if (item.kind === 'in') {
          const r = await deps.clockIn({ visitId: item.visitId, clientId: item.clientId, at: new Date(item.at), lat: item.lat, lng: item.lng, offline: true });
          if (!r.ok && r.reason === 'network') return 'offline';
          if (r.ok) {
            ids.set(item.clientId, r.data.id);
            // La salida que espera esta entrada ya sabe su id (aunque se mande en otra pasada).
            q = q.map((x) => (x.kind === 'out' && x.clientId === item.clientId ? { ...x, entryId: r.data.id } : x));
            const shift = await loadShift();
            if (shift && shift.clientId === item.clientId) await saveShift({ ...shift, entryId: r.data.id });
          }
        } else {
          const entryId = item.entryId ?? ids.get(item.clientId) ?? (await loadShift())?.entryId ?? null;
          if (!entryId) return 'offline';
          const r = await deps.clockOut({ entryId, at: new Date(item.at), lat: item.lat, lng: item.lng, offline: true });
          if (!r.ok && r.reason === 'network') return 'offline';
        }
        q = q.slice(1);
        await kv.setItem(QUEUE, JSON.stringify(q));
      }
      return 'synced';
    } finally {
      running = null;
    }
  })();
  return running;
}
