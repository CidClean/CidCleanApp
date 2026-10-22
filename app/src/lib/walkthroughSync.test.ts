jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { newArea, newDoc, pendingCount, syncBadge, type Area } from './walkthroughRules';
import { loadWalkthrough, saveWalkthrough, setWalkthroughStorage, updateWalkthrough } from './walkthroughStore';
import { syncWalkthrough, type SendResult, type SyncDeps } from './walkthroughSync';

/** Prueba sin red simulada (D-004): se arma el walkthrough sin conexión, con fotos, y se sincroniza al volver la señal. */

function memoryKV() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
    getAllKeys: async () => [...m.keys()],
    raw: m,
  };
}

function fakeServer() {
  let online = false;
  const drafts = new Map<string, unknown>();
  const files = new Set<string>();
  const deps: SyncDeps = {
    saveDraft: async (doc, data): Promise<SendResult> => {
      if (!online) return 'offline';
      drafts.set(doc.id, data);
      return 'ok';
    },
    uploadPhoto: async (path): Promise<SendResult> => {
      if (!online) return 'offline';
      files.add(path);
      return 'ok';
    },
  };
  return { deps, drafts, files, setOnline: (v: boolean) => (online = v) };
}

const label = (t: Area['type']) => (t === 'bathroom' ? 'Baño' : 'Oficina');

test('sin red se guarda todo en el teléfono; al volver la señal sube el documento y luego las fotos', async () => {
  const kv = memoryKV();
  setWalkthroughStorage(kv);
  const server = fakeServer();

  // 1. Sin red: crear el walkthrough, un área con dos fotos y la frecuencia.
  const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'Gulf', siteLabel: '5th', contact: {} });
  await saveWalkthrough(doc);
  const area = newArea([], label);
  const photos = ['f1', 'f2'].map((id) => ({ id, path: `${doc.id}/${id}.jpg`, uri: `file:///${id}.jpg`, note: '', uploaded: false }));
  await updateWalkthrough(doc.id, (d) => ({ ...d, data: { ...d.data, areas: [{ ...area, size: '120', photos }] } }));
  await updateWalkthrough(doc.id, (d) => ({ ...d, data: { ...d.data, frequency: { kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], other: '' } } }));

  expect(await syncWalkthrough(doc.id, server.deps)).toBe('offline');
  let local = (await loadWalkthrough(doc.id))!;
  expect(pendingCount(local)).toBe(3); // documento + 2 fotos
  expect(syncBadge(local)).toEqual({ kind: 'pending', count: 3 });
  expect(server.drafts.size).toBe(0);
  // Quedó en el almacenamiento del teléfono (sobrevive a cerrar la app).
  expect([...kv.raw.keys()]).toEqual([`cidclean-wt:${doc.id}`]);

  // 2. Vuelve la señal.
  server.setOnline(true);
  expect(await syncWalkthrough(doc.id, server.deps)).toBe('synced');
  local = (await loadWalkthrough(doc.id))!;
  expect(pendingCount(local)).toBe(0);
  expect(syncBadge(local)).toEqual({ kind: 'synced' });
  expect(server.files).toEqual(new Set([`${doc.id}/f1.jpg`, `${doc.id}/f2.jpg`]));
  const sent = server.drafts.get(doc.id) as { areas: { size: string; photos: { uri?: string }[] }[]; frequency: { kind: string } };
  expect(sent.areas[0].size).toBe('120');
  expect(sent.areas[0].photos[0].uri).toBeUndefined();
  expect(sent.frequency.kind).toBe('daily');

  // 3. Un cambio más sin red vuelve a quedar pendiente y el aviso lo cuenta.
  server.setOnline(false);
  await updateWalkthrough(doc.id, (d) => ({ ...d, data: { ...d.data, internal: { ...d.data.internal, staff: '2' } } }));
  expect(await syncWalkthrough(doc.id, server.deps)).toBe('offline');
  expect(syncBadge((await loadWalkthrough(doc.id))!)).toEqual({ kind: 'pending', count: 1 });
  server.setOnline(true);
  expect(await syncWalkthrough(doc.id, server.deps)).toBe('synced');
});

test('si se corta a mitad de las fotos, lo subido no se repite y lo demás queda pendiente', async () => {
  setWalkthroughStorage(memoryKV());
  let calls = 0;
  const uploaded: string[] = [];
  const deps: SyncDeps = {
    saveDraft: async () => 'ok',
    uploadPhoto: async (path) => {
      calls += 1;
      if (calls === 2) return 'offline';
      uploaded.push(path);
      return 'ok';
    },
  };
  const doc = newDoc({ siteId: 's', leadId: 'l', appointmentId: null, company: 'c', siteLabel: 's', contact: {} });
  const photos = ['a', 'b', 'c'].map((id) => ({ id, path: `w/${id}.jpg`, uri: `file:///${id}`, note: '', uploaded: false }));
  await saveWalkthrough({ ...doc, data: { ...doc.data, areas: [{ ...newArea([], label), photos }] } });
  expect(await syncWalkthrough(doc.id, deps)).toBe('offline');
  expect(pendingCount((await loadWalkthrough(doc.id))!)).toBe(2);
  expect(await syncWalkthrough(doc.id, deps)).toBe('synced');
  expect(uploaded).toEqual(['w/a.jpg', 'w/b.jpg', 'w/c.jpg']);
});

test('un error del servidor (no de red) no marca nada como mandado', async () => {
  setWalkthroughStorage(memoryKV());
  const doc = newDoc({ siteId: 's', leadId: 'l', appointmentId: null, company: 'c', siteLabel: 's', contact: {} });
  await saveWalkthrough(doc);
  expect(await syncWalkthrough(doc.id, { saveDraft: async () => 'error', uploadPhoto: async () => 'ok' })).toBe('error');
  expect(pendingCount((await loadWalkthrough(doc.id))!)).toBe(1);
});

test('Cerrar walkthrough sin red: al volver la señal manda todo, cierra y pide el PDF de la versión (D-212)', async () => {
  setWalkthroughStorage(memoryKV());
  const server = fakeServer();
  const closed: string[] = [];
  const pdfs: number[] = [];
  const deps: SyncDeps = {
    ...server.deps,
    close: async (d) => {
      if (!server.files.has(`${d.id}/f1.jpg`)) return { ok: false, result: 'error' };
      closed.push(d.id);
      return { ok: true, version: 1 };
    },
    generatePdf: async (_d, version) => void pdfs.push(version),
  };
  const doc = newDoc({ siteId: 's', leadId: 'l', appointmentId: null, company: 'c', siteLabel: 's', contact: {} });
  const photos = [{ id: 'f1', path: `${doc.id}/f1.jpg`, uri: 'file:///f1', note: '', uploaded: false }];
  await saveWalkthrough({ ...doc, data: { ...doc.data, areas: [{ ...newArea([], label), photos }] } });
  await updateWalkthrough(doc.id, (d) => ({ ...d, closeRequested: true }));

  expect(await syncWalkthrough(doc.id, deps)).toBe('offline');
  expect(pendingCount((await loadWalkthrough(doc.id))!)).toBe(3); // documento + foto + cierre
  expect(closed).toEqual([]);

  server.setOnline(true);
  expect(await syncWalkthrough(doc.id, deps)).toBe('synced');
  const local = (await loadWalkthrough(doc.id))!;
  expect(local).toMatchObject({ status: 'closed', version: 1, closeRequested: false, step: 5 });
  expect(pendingCount(local)).toBe(0);
  expect(closed).toEqual([doc.id]);
  await Promise.resolve();
  expect(pdfs).toEqual([1]);
});
