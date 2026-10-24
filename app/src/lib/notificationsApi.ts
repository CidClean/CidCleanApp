import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { supabase } from './supabase';

/** Avisos (hito 7, migración 20261027000003): la bandeja, el contador del Menú y los canales del perfil. */

export type NotificationLink = { pathname: string; params?: Record<string, string> };
export type AppNotification = { id: string; kind: string; title: string; detail: string | null; link: NotificationLink | null; createdAt: string; read: boolean };
export type ChannelSettings = { push: boolean; email: boolean; inApp: boolean };

/** Rutas que un aviso puede abrir (D-118). Cualquier otra se ignora y la fila solo se marca leída. */
const ROUTES = new Set([
  '/',
  '/leads/[id]',
  '/jobsites/[id]',
  '/schedule',
  '/schedule/work/[id]',
  '/accounting/income',
  '/accounting/expenses',
]);

export function safeLink(raw: unknown): NotificationLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { pathname?: unknown; params?: unknown };
  if (typeof r.pathname !== 'string' || !ROUTES.has(r.pathname)) return null;
  const params: Record<string, string> = {};
  if (r.params && typeof r.params === 'object')
    for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) if (typeof v === 'string') params[k] = v;
  return { pathname: r.pathname, params };
}

export async function fetchNotifications(): Promise<ApiResult<AppNotification[]>> {
  try {
    const { data, error } = await supabase.rpc('my_notifications', { p_limit: 100 });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        kind: String(r.kind),
        title: String(r.title ?? ''),
        detail: (r.detail as string | null) ?? null,
        link: safeLink(r.link),
        createdAt: String(r.created_at),
        read: r.read === true,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchUnreadCount(): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('my_unread_count');
    if (error) return null;
    return Number(data ?? 0);
  } catch {
    return null;
  }
}

/** null marca todas. */
export async function markRead(id: string | null): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('mark_notifications_read', { p_id: id });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchChannelSettings(): Promise<ApiResult<ChannelSettings>> {
  try {
    const { data, error } = await supabase.rpc('my_notification_settings');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const d = (data ?? {}) as Record<string, unknown>;
    return { ok: true, data: { push: d.push !== false, email: d.email !== false, inApp: d.in_app !== false } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function saveChannelSettings(s: ChannelSettings): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('set_my_notification_settings', { p_push: s.push, p_email: s.email, p_in_app: s.inApp });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
