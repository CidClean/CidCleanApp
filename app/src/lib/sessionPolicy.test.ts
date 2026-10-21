import {
  ADMIN_SESSION_DAYS,
  DAY_MS,
  STAFF_SESSION_DAYS,
  evaluateSession,
  isAdminProfile,
  isPastLimit,
  sessionLimitDays,
  type ProfileLookup,
} from './sessionPolicy';

const START = Date.UTC(2026, 9, 1, 12, 0, 0);

const staff: ProfileLookup = { kind: 'found', profile: { role: 'employee', is_super_admin: false, active: true } };
const supervisor: ProfileLookup = { kind: 'found', profile: { role: 'supervisor', is_super_admin: false, active: true } };
const admin: ProfileLookup = { kind: 'found', profile: { role: 'admin', is_super_admin: false, active: true } };
const superAdmin: ProfileLookup = {
  kind: 'found',
  profile: { role: 'employee', is_super_admin: true, active: true },
};

const at = (days: number, extraMs = 0) => START + days * DAY_MS + extraMs;

describe('límites de la sesión (D-124, D-136)', () => {
  test('7 días para rol admin y para Super Admin; 30 para los demás', () => {
    expect(sessionLimitDays({ role: 'admin', is_super_admin: false })).toBe(ADMIN_SESSION_DAYS);
    expect(sessionLimitDays({ role: 'employee', is_super_admin: true })).toBe(ADMIN_SESSION_DAYS);
    expect(sessionLimitDays({ role: 'supervisor', is_super_admin: false })).toBe(STAFF_SESSION_DAYS);
    expect(sessionLimitDays({ role: 'employee', is_super_admin: false })).toBe(STAFF_SESSION_DAYS);
    expect(sessionLimitDays({ role: null, is_super_admin: false })).toBe(STAFF_SESSION_DAYS);
    expect(ADMIN_SESSION_DAYS).toBe(7);
    expect(STAFF_SESSION_DAYS).toBe(30);
  });

  test('isAdminProfile', () => {
    expect(isAdminProfile({ role: 'admin', is_super_admin: false })).toBe(true);
    expect(isAdminProfile({ role: 'supervisor', is_super_admin: false })).toBe(false);
  });
});

describe('isPastLimit: justo antes, en el instante exacto y justo después', () => {
  test('7 días', () => {
    expect(isPastLimit(START, at(7, -1), 7)).toBe(false);
    expect(isPastLimit(START, at(7), 7)).toBe(false);
    expect(isPastLimit(START, at(7, 1), 7)).toBe(true);
  });
  test('30 días', () => {
    expect(isPastLimit(START, at(30, -1), 30)).toBe(false);
    expect(isPastLimit(START, at(30), 30)).toBe(false);
    expect(isPastLimit(START, at(30, 1), 30)).toBe(true);
  });
});

describe('evaluateSession', () => {
  test('admin: vale justo antes de 7 días y vence justo después', () => {
    expect(evaluateSession({ startedAtMs: START, nowMs: at(7, -1), profile: admin })).toEqual({ valid: true });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(7), profile: admin })).toEqual({ valid: true });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(7, 1), profile: admin })).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  test('Super Admin: mismo límite de 7 días', () => {
    expect(evaluateSession({ startedAtMs: START, nowMs: at(7, -1), profile: superAdmin })).toEqual({ valid: true });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(7, 1), profile: superAdmin })).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  test('staff y supervisor: a los 8 días sigue valiendo; vale justo antes de 30 y vence justo después', () => {
    for (const profile of [staff, supervisor]) {
      expect(evaluateSession({ startedAtMs: START, nowMs: at(8), profile })).toEqual({ valid: true });
      expect(evaluateSession({ startedAtMs: START, nowMs: at(30, -1), profile })).toEqual({ valid: true });
      expect(evaluateSession({ startedAtMs: START, nowMs: at(30), profile })).toEqual({ valid: true });
      expect(evaluateSession({ startedAtMs: START, nowMs: at(30, 1), profile })).toEqual({
        valid: false,
        reason: 'expired',
      });
    }
  });

  test('perfil inactivo o inexistente cierra la sesión aunque no haya vencido el tiempo', () => {
    const inactive: ProfileLookup = {
      kind: 'found',
      profile: { role: 'employee', is_super_admin: false, active: false },
    };
    expect(evaluateSession({ startedAtMs: START, nowMs: at(1), profile: inactive })).toEqual({
      valid: false,
      reason: 'inactive',
    });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(1), profile: { kind: 'missing' } })).toEqual({
      valid: false,
      reason: 'no_profile',
    });
  });

  test('sin fecha de inicio la sesión no es válida', () => {
    expect(evaluateSession({ startedAtMs: null, nowMs: at(1), profile: staff })).toEqual({
      valid: false,
      reason: 'no_start',
    });
    expect(evaluateSession({ startedAtMs: Number.NaN, nowMs: at(1), profile: staff })).toEqual({
      valid: false,
      reason: 'no_start',
    });
  });

  test('sin poder consultar el perfil solo vence con el límite más largo (30 días)', () => {
    const unknown: ProfileLookup = { kind: 'unknown' };
    expect(evaluateSession({ startedAtMs: START, nowMs: at(8), profile: unknown })).toEqual({ valid: true });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(30, -1), profile: unknown })).toEqual({ valid: true });
    expect(evaluateSession({ startedAtMs: START, nowMs: at(30, 1), profile: unknown })).toEqual({
      valid: false,
      reason: 'expired',
    });
  });
});
