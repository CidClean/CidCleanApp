import { getStrings } from '@/i18n';
import { historyDetail, historyTime, historyTitle, mergePage, type HistoryEntry } from './history';

const es = getStrings('es');
const en = getStrings('en');
const e = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: 1, at: '2026-10-21T18:35:00Z', action: 'perfil_creado', subject: 'Laura Gil', actor: 'Cid Clean', info: {}, ...over,
});
const change = (antes: object, despues: object) => e({ action: 'perfil_cambiado', info: { antes, despues } });

describe('títulos (D-198)', () => {
  test('los ejemplos aprobados de la ronda 17', () => {
    expect(historyTitle(es, e({ action: 'perfil_creado' }))).toBe('Empleado creado');
    expect(historyTitle(es, e({ action: 'permiso_dado', info: { permiso: 'empleados_ver' } }))).toBe('Permiso dado: Ver lista');
    expect(historyTitle(es, e({ action: 'documento_abierto', info: { kind: 'w9' } }))).toBe('Documento abierto: W-9');
    expect(historyTitle(es, change({ active: true }, { active: false }))).toBe('Empleado desactivado');
    expect(historyTitle(es, e({ action: 'terminos_publicados', info: { kind: 'staff', version: 2 } }))).toBe('Términos publicados: versión 2');
    expect(historyTitle(es, e({ action: 'terminos_aceptados', info: { kind: 'staff', version: 2 } }))).toBe('Términos aceptados: versión 2');
  });

  test('todas las acciones que escribe change_log tienen título, también las de leads', () => {
    const actions = [
      'perfil_creado', 'perfil_cambiado', 'invitacion_enviada', 'invitacion_reenviada', 'invitacion_fallida', 'permiso_dado',
      'permiso_quitado', 'documento_subido', 'documento_reemplazado', 'documento_abierto', 'terminos_publicados',
      'terminos_aceptados', 'super_admin_transferido', 'lead_creado', 'lead_estado_cambiado', 'lead_eliminado',
      'walkthrough_agendado', 'walkthrough_reagendado', 'walkthrough_estado_cambiado', 'sitio_editado', 'sitio_eliminado',
      'motivo_creado', 'motivo_editado', 'motivo_desactivado', 'motivo_eliminado', 'quote_creado', 'quote_version_nueva',
      'quote_enviado', 'quote_visto', 'quote_aceptado', 'quote_rechazado', 'quote_cambios_pedidos', 'cliente_creado', 'jobsite_creado',
      'w9_enviado', 'w9_reenviado', 'w9_firmado',
    ];
    for (const action of actions) {
      expect(historyTitle(es, e({ action }))).not.toBe(es.history.unknown);
      expect(historyTitle(en, e({ action }))).not.toBe(en.history.unknown);
    }
  });

  test('acción desconocida: título genérico, sin fallar', () => {
    expect(historyTitle(es, e({ action: 'algo_nuevo' }))).toBe('Cambio registrado');
    expect(historyTitle(en, e({ action: 'algo_nuevo' }))).toBe('Change recorded');
  });

  test('perfil cambiado: según lo que cambió', () => {
    expect(historyTitle(es, change({ active: false }, { active: true }))).toBe('Empleado reactivado');
    expect(historyTitle(es, change({ role: 'employee' }, { role: 'supervisor' }))).toBe('Rol cambiado: Supervisor');
    expect(historyTitle(es, change({ worker_type: 'w2' }, { worker_type: '1099' }))).toBe('Tipo cambiado: 1099');
    expect(historyTitle(es, change({ has_app_access: false }, { has_app_access: true }))).toBe('Acceso a la app dado');
    expect(historyTitle(es, change({ is_super_admin: true, role: 'admin' }, { is_super_admin: false, role: 'admin' }))).toBe('Ya no es Super Admin');
    expect(historyTitle(es, change({ is_super_admin: false }, { is_super_admin: true }))).toBe('Ahora es Super Admin');
    expect(historyTitle(es, change({}, {}))).toBe('Empleado editado');
  });

  test('permiso desconocido o documento sin tipo no rompen el título', () => {
    expect(historyTitle(es, e({ action: 'permiso_quitado', info: { permiso: 'inventado' } }))).toBe('Permiso quitado: inventado');
    expect(historyTitle(es, e({ action: 'documento_subido', info: {} }))).toBe('Documento subido: ');
  });
});

describe('sitios y motivos (orden 13)', () => {
  test('títulos con el patrón de D-198', () => {
    expect(historyTitle(es, e({ action: 'sitio_editado' }))).toBe('Sitio editado');
    expect(historyTitle(es, e({ action: 'sitio_eliminado' }))).toBe('Sitio eliminado');
    expect(historyTitle(es, e({ action: 'motivo_creado' }))).toBe('Motivo creado');
    expect(historyTitle(es, e({ action: 'motivo_editado' }))).toBe('Motivo editado');
    expect(historyTitle(es, e({ action: 'motivo_desactivado' }))).toBe('Motivo desactivado');
    expect(historyTitle(es, e({ action: 'motivo_eliminado' }))).toBe('Motivo eliminado');
  });
  test('el motivo se nombra en el idioma de la app', () => {
    const m = e({ action: 'motivo_creado', subject: null, info: { label_es: 'Precio', label_en: 'Price' } });
    expect(historyDetail(es, m, 'es')).toBe('Precio · por Cid Clean');
    expect(historyDetail(en, m, 'en')).toBe('Price · by Cid Clean');
  });
});

describe('detalle (D-198)', () => {
  test('"{a quién o qué} · por {quién}"', () => {
    expect(historyDetail(es, e({}))).toBe('Laura Gil · por Cid Clean');
    expect(historyDetail(en, e({}))).toBe('Laura Gil · by Cid Clean');
  });
  test('términos publicados: "Staff · por Cid Clean"; aceptados: solo quién', () => {
    expect(historyDetail(es, e({ action: 'terminos_publicados', subject: 'staff' }))).toBe('Staff · por Cid Clean');
    expect(historyDetail(es, e({ action: 'terminos_aceptados', subject: 'staff', actor: 'Laura Gil' }))).toBe('Laura Gil');
  });
  test('sin a quién o sin quién, queda lo que haya', () => {
    expect(historyDetail(es, e({ subject: null }))).toBe('por Cid Clean');
    expect(historyDetail(es, e({ actor: null }))).toBe('Laura Gil');
    expect(historyDetail(es, e({ subject: null, actor: null }))).toBe('');
  });
});

describe('hora (D-198)', () => {
  const now = new Date(2026, 9, 21, 16, 0);
  test('Hoy, Ayer y fecha corta, en español', () => {
    expect(historyTime(es, 'es', new Date(2026, 9, 21, 14, 35).toISOString(), now)).toBe('Hoy 2:35 p. m.');
    expect(historyTime(es, 'es', new Date(2026, 9, 20, 18, 2).toISOString(), now)).toBe('Ayer 6:02 p. m.');
    expect(historyTime(es, 'es', new Date(2026, 9, 12, 9, 15).toISOString(), now)).toBe('12 oct 9:15 a. m.');
    expect(historyTime(es, 'es', new Date(2026, 9, 12, 0, 5).toISOString(), now)).toBe('12 oct 12:05 a. m.');
    expect(historyTime(es, 'es', new Date(2026, 9, 12, 12, 5).toISOString(), now)).toBe('12 oct 12:05 p. m.');
  });
  test('en inglés', () => {
    expect(historyTime(en, 'en', new Date(2026, 9, 21, 14, 35).toISOString(), now)).toBe('Today 2:35 PM');
    expect(historyTime(en, 'en', new Date(2026, 9, 20, 18, 2).toISOString(), now)).toBe('Yesterday 6:02 PM');
    expect(historyTime(en, 'en', new Date(2026, 9, 12, 9, 15).toISOString(), now)).toBe('Oct 12 9:15 AM');
  });
  test('de otro año lleva el año', () => {
    expect(historyTime(es, 'es', new Date(2025, 11, 30, 9, 15).toISOString(), now)).toBe('30 dic 2025 9:15 a. m.');
    expect(historyTime(en, 'en', new Date(2025, 11, 30, 9, 15).toISOString(), now)).toBe('Dec 30, 2025 9:15 AM');
  });
  test('ayer a fin de mes', () => {
    expect(historyTime(es, 'es', new Date(2026, 9, 31, 23, 0).toISOString(), new Date(2026, 10, 1, 8, 0))).toBe('Ayer 11:00 p. m.');
  });
});

describe('páginas', () => {
  test('junta sin repetir y en orden, la más reciente arriba', () => {
    const page1 = [e({ id: 9 }), e({ id: 8 })];
    const page2 = [e({ id: 8 }), e({ id: 7 })];
    expect(mergePage(page1, page2).map((x) => x.id)).toEqual([9, 8, 7]);
  });
});
