// Tipos mínimos de open-location-code@1.0.3 (Google, Apache-2.0): solo lo que usa lib/plusCode.ts.
declare module 'open-location-code' {
  export type CodeArea = {
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  };
  export class OpenLocationCode {
    isValid(code: string): boolean;
    isShort(code: string): boolean;
    isFull(code: string): boolean;
    decode(code: string): CodeArea;
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string;
  }
}
