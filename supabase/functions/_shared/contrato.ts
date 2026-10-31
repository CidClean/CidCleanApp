// Contrato del cliente (orden 62, D-283): relleno de la plantilla y filas del certificado de firma. Sin pdf-lib, para
// probarlo con Node (supabase/tests/contrato.test.mjs). El PDF se arma en contratoPdf.ts. Este archivo no contiene llaves.
import { horaNaples } from './contratoCorreos.ts';
import { consentText, TEMPLATE_VERSION } from './legal/csa-sow-1.0.ts';

export type Campos = Record<string, string>;

/** Datos del contrato tal como los devuelve contract_json() en la base. */
export type ContratoDb = {
  id: string; jobsite_id: string; csa: string; sow: string; template_version: string; quote_number: string;
  quote_version: string; fields: Campos; missing: string[];
  client_signer_name: string | null; client_signer_title: string | null; client_signer_email: string | null;
  client_signed_at: string | null; client_ip: string | null; client_user_agent: string | null; client_signature_id: string | null;
  sent_at: string | null; sent_by_name?: string | null;
};

export type Firmas = {
  cliente?: { name: string; title: string; at: Date } | null;
  cidClean?: { name: string; title: string; at: Date } | null;
};

/** Campos automáticos (no editables) más los guardados. */
export function camposDe(c: ContratoDb): Campos {
  return {
    ...c.fields,
    sow_no: c.sow, csa_no: c.csa, quote_no: c.quote_number, quote_version: c.quote_version, sow_version: c.quote_version,
    template_version: c.template_version,
  };
}

const BLANCO = '____________';

/** Reemplaza `{{llave}}` por su valor; lo vacío queda como línea en blanco (no debería pasar: no se envía con faltantes). */
export function rellenar(texto: string, campos: Campos): string {
  return texto.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, k: string) => {
    const v = (campos[k] ?? '').trim();
    return v || BLANCO;
  });
}

/** Llaves que usa un texto (para probar que la plantilla y la base coinciden). */
export function llaves(texto: string): string[] {
  return [...texto.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
}

export const AUTOMATICAS = ['sow_no', 'csa_no', 'quote_no', 'quote_version', 'sow_version', 'template_version'];

/** Filas del certificado de la firma electrónica (D-283, como D-268 (4) del W-9). */
export function filasCertificadoContrato(o: {
  csa: string; sow: string; pdfSha256: string; signatureId: string; company: string;
  cliente: { name: string; title: string; email: string; at: Date; ip: string | null; userAgent: string | null; signatureId: string | null };
  cidClean: { name: string; title: string; email: string | null; at: Date; ip: string | null; userAgent: string | null };
  sentAt: Date | null; sentBy: string | null;
}): [string, string][] {
  return [
    ['Document', `Commercial Service Agreement ${o.csa} and Scope of Work ${o.sow} (template version ${TEMPLATE_VERSION})`],
    ['Document ID', o.signatureId],
    ['Document SHA-256', `${o.pdfSha256} (the signed agreement before this certificate was added)`],
    ['Client signer', `${o.cliente.name}, ${o.cliente.title}`],
    ['Verified email', `${o.cliente.email} (verified with a one-time 6-digit code sent to this address)`],
    ['Client signed on', `${horaNaples(o.cliente.at, true)} (America/New_York) · ${utc(o.cliente.at)}`],
    ['Client IP address', o.cliente.ip ?? 'Not available'],
    ['Client browser', o.cliente.userAgent || 'Not available'],
    ['Consent to sign electronically', `Accepted. Checkbox: "${consentText(o.company)}"`],
    ['Client signature ID', o.cliente.signatureId ?? 'Not available'],
    ['Countersigned by', `${o.cidClean.name}, ${o.cidClean.title}, Cid Clean LLC${o.cidClean.email ? ` (${o.cidClean.email})` : ''}`],
    ['Countersigned on', `${horaNaples(o.cidClean.at, true)} (America/New_York) · ${utc(o.cidClean.at)}`],
    ['Countersigner IP / browser', `${o.cidClean.ip ?? 'Not available'} · ${o.cidClean.userAgent || 'Not available'}`],
    ['Sent for signature', o.sentAt ? `${o.sentBy ? `By ${o.sentBy}, Cid Clean LLC, on` : 'On'} ${horaNaples(o.sentAt)}` : 'Not available'],
  ];
}

function utc(d: Date): string {
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

/** SHA-256 en hex de unos bytes. */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
