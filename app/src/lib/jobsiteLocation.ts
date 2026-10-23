import { plusCodeToCoordinates } from './plusCode';
import { setJobsiteLocation } from './scheduleApi';

/**
 * Guarda la ubicación del jobsite a partir de su Plus Code (D-214: la cerca de 150 m se mide en el servidor). Si no se
 * puede guardar no detiene el flujo: la entrada queda "Sin ubicación" para revisión.
 */
export async function saveLocation(jobsiteId: string, plusCode: string | null | undefined): Promise<void> {
  const c = plusCode?.trim() ? plusCodeToCoordinates(plusCode) : null;
  await setJobsiteLocation(jobsiteId, c?.latitude ?? null, c?.longitude ?? null);
}
