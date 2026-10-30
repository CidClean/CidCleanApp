import type { Locale } from '@/i18n';
import type { Strings } from '@/i18n/es';
import { documentRows, formatDate, type DocumentKind, type EmployeeDocument } from './employeeRules';

/** "Mis documentos" del 1099 con acceso a la app (D-263, D-271). Reglas puras, sin React ni red. */

export function showsMyDocuments(profile: { workerType: 'w2' | '1099' | null } | null): boolean {
  return profile?.workerType === '1099';
}

export type MyDocumentCard = {
  kind: DocumentKind;
  title: string;
  detail: string;
  chip: string;
  tone: 'success' | 'warning';
  documentId: string | null;
  /** Solo el certificado: con archivo, botón de contorno y la nota; sin archivo, botón lleno sin nota (D-271). */
  upload: { label: string; variant: 'outline' | 'solid'; note: string | null } | null;
};

export function myDocumentCards(documents: readonly EmployeeDocument[], strings: Strings, locale: Locale): MyDocumentCard[] {
  return documentRows(documents).map((row) => {
    const has = row.state === 'uploaded' && row.uploadedAt !== null;
    const date = has ? formatDate(row.uploadedAt as string, locale) : '';
    const w9 = row.kind === 'w9';
    return {
      kind: row.kind,
      title: w9 ? strings.employee.w9 : strings.employee.insuranceCertificate,
      detail: !has ? strings.employee.noFile : w9 ? strings.profile.signedOn(date) : strings.employee.uploadedOn(date),
      chip: !has ? strings.employee.missingChip : w9 ? strings.profile.signedChip : strings.employee.uploadedChip,
      tone: has ? 'success' : 'warning',
      documentId: row.documentId,
      upload: w9
        ? null
        : has
          ? { label: strings.profile.uploadNewCertificate, variant: 'outline', note: strings.profile.certificateNote }
          : { label: strings.profile.uploadCertificate, variant: 'solid', note: null },
    };
  });
}
