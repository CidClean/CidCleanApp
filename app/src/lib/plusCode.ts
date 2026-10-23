import { OpenLocationCode } from 'open-location-code';

/**
 * Plus Code del jobsite a coordenadas, dentro de la app y sin servicio de mapas (D-211).
 * Acepta el código completo ("76RW66G8+4P") o corto con la localidad ("66G8+4P Naples, Florida").
 * Un código corto se completa con el punto de referencia de Naples, Florida (Cid Clean opera en Collier County),
 * así que la localidad escrita no se geocodifica (D-200). Sirve para todo el suroeste de Florida.
 */

const olc = new OpenLocationCode();

/** Centro de Naples, FL. */
export const NAPLES = { latitude: 26.142, longitude: -81.7948 } as const;

export type Coordinates = { latitude: number; longitude: number; fullCode: string };

/** La parte del código ("66G8+4P") de lo que escribió la persona. */
export function codePart(text: string): string | null {
  const token = text.trim().split(/[\s,]+/).find((t) => t.includes('+'));
  return token ? token.toUpperCase() : null;
}

export function plusCodeToCoordinates(text: string, reference = NAPLES): Coordinates | null {
  const code = codePart(text);
  if (!code) return null;
  try {
    if (!olc.isValid(code)) return null;
    const full = olc.isShort(code) ? olc.recoverNearest(code, reference.latitude, reference.longitude) : code;
    if (!olc.isFull(full)) return null;
    const area = olc.decode(full);
    return {
      latitude: Math.round(area.latitudeCenter * 1e6) / 1e6,
      longitude: Math.round(area.longitudeCenter * 1e6) / 1e6,
      fullCode: full,
    };
  } catch {
    return null;
  }
}

export function isValidPlusCode(text: string): boolean {
  return plusCodeToCoordinates(text) !== null;
}

/** "26.12775, -81.73281" para mostrar debajo del Plus Code. */
export function formatCoordinates(c: Pick<Coordinates, 'latitude' | 'longitude'>): string {
  return `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
}
