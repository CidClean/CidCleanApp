// Contrato de contratista independiente (ICA, orden 65, D-285): relleno de la plantilla 1.0 y filas del certificado de
// firma. Sin pdf-lib, para probarlo con Node (supabase/tests/ica.test.mjs). El PDF se arma en icaPdf.ts.
// Este archivo no contiene llaves.
import { horaNaples } from './contratoCorreos.ts';
import { ICA_TEMPLATE_VERSION, icaConsentText } from './legal/ica-1.0.ts';

export type CamposIca = Record<string, string>;

/** Datos del ICA tal como los devuelve ica_json() en la base. */
export type IcaDb = {
  id: string; profile_id: string; ica: string; template_version: string; status: string; fields: CamposIca; missing: string[];
  email: string | null; sent_at: string | null; sent_by_name?: string | null; expires_at: string | null;
  contractor_signer_name: string | null; contractor_signer_email: string | null; contractor_signed_at: string | null;
  contractor_ip: string | null; contractor_user_agent: string | null; contractor_signature_id: string | null;
};

export type FirmasIca = {
  contratista?: { name: string; at: Date } | null;
  cidClean?: { name: string; title: string; at: Date } | null;
};

export const AUTOMATICAS_ICA = ['ica_no', 'template_version'];

/** Campos automáticos (no editables) más los guardados. */
export function camposDeIca(c: Pick<IcaDb, 'fields' | 'ica' | 'template_version'>): CamposIca {
  return { ...c.fields, ica_no: c.ica, template_version: c.template_version };
}

/** Filas del certificado de la firma electrónica (como el contrato del cliente y el W-9, D-268 (4)). */
export function filasCertificadoIca(o: {
  ica: string; pdfSha256: string; signatureId: string;
  contratista: { name: string; email: string; at: Date; ip: string | null; userAgent: string | null; signatureId: string | null };
  cidClean: { name: string; title: string; email: string | null; at: Date; ip: string | null; userAgent: string | null };
  sentAt: Date | null; sentBy: string | null;
}): [string, string][] {
  return [
    ['Document', `Independent Contractor Agreement ${o.ica} (template version ${ICA_TEMPLATE_VERSION})`],
    ['Document ID', o.signatureId],
    ['Document SHA-256', `${o.pdfSha256} (the signed agreement before this certificate was added)`],
    ['Contractor signer', o.contratista.name],
    ['Verified email', `${o.contratista.email} (verified with a one-time 6-digit code sent to this address)`],
    ['Contractor signed on', `${horaNaples(o.contratista.at, true)} (America/New_York) · ${utc(o.contratista.at)}`],
    ['Contractor IP address', o.contratista.ip ?? 'Not available'],
    ['Contractor browser', o.contratista.userAgent || 'Not available'],
    ['Consent to sign electronically', `Accepted. Checkbox: "${icaConsentText()}"`],
    ['Contractor signature ID', o.contratista.signatureId ?? 'Not available'],
    ['Countersigned by', `${o.cidClean.name}, ${o.cidClean.title}, Cid Clean LLC${o.cidClean.email ? ` (${o.cidClean.email})` : ''}`],
    ['Countersigned on', `${horaNaples(o.cidClean.at, true)} (America/New_York) · ${utc(o.cidClean.at)}`],
    ['Countersigner IP / browser', `${o.cidClean.ip ?? 'Not available'} · ${o.cidClean.userAgent || 'Not available'}`],
    ['Sent for signature', o.sentAt ? `${o.sentBy ? `By ${o.sentBy}, Cid Clean LLC, on` : 'On'} ${horaNaples(o.sentAt)}` : 'Not available'],
  ];
}

function utc(d: Date): string {
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

export const NOTA_CERTIFICADO_ICA =
  'This certificate records how each party signed this Independent Contractor Agreement electronically. A free paper copy is available on request at info@cidclean.com.';
