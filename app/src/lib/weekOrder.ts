/**
 * Orden de los días (D-231: toda semana empieza en domingo). La frecuencia guarda los días como 0 = lunes … 6 = domingo
 * (D-038); solo cambia el orden en que se muestran.
 */
export const SUNDAY_FIRST: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

/** Para ordenar días guardados (0 = lunes) de domingo a sábado. */
export const sundayRank = (d: number): number => (d + 1) % 7;

export const bySunday = (a: number, b: number): number => sundayRank(a) - sundayRank(b);
