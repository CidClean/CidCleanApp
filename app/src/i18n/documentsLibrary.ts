import type { Locale } from './index';

/** Menú → Documentos (orden 115, D-317 4, D-320 muestra 4). APROBADO = muestra aprobada; D-200 = detalle menor. */
export const documentsLibraryEs = {
  title: 'Documentos', // APROBADO (D-320)
  search: 'Buscar por cliente, persona o nombre', // APROBADO (D-320)
  filters: {
    all: 'Todos', quotes: 'Quotes', sow: 'SOW', contracts: 'Contratos', walkthroughs: 'Walkthroughs', personal: 'Personal', reports: 'Reportes',
  }, // APROBADO (D-320)
  download: 'Descargar', // APROBADO (D-320)
  superAdminOnly: 'Solo Super Admin', // APROBADO (D-320)
  contract: (v: string) => `Contrato firmado · ${v}`, // APROBADO (D-320: "Contrato firmado")
  jobsiteDoc: (title: string) => `Documento del jobsite · ${title}`, // D-200
  insurance: 'Certificado de seguro', // D-200
  empty: 'No hay documentos para mostrar.', // D-200
  emptyReports: 'Los reportes que se arman al momento (P&L, horario) no se guardan y no aparecen aquí.', // D-200
  more: 'Ver más', // D-200
  error: 'No se pudieron cargar los documentos. Inténtalo otra vez.', // D-200
  errorOpen: 'No se pudo abrir el documento.', // D-200
};

export type DocumentsLibraryStrings = typeof documentsLibraryEs;

export const documentsLibraryEn: DocumentsLibraryStrings = {
  title: 'Documents',
  search: 'Search by client, person or name',
  filters: { all: 'All', quotes: 'Quotes', sow: 'SOW', contracts: 'Contracts', walkthroughs: 'Walkthroughs', personal: 'Staff', reports: 'Reports' },
  download: 'Download',
  superAdminOnly: 'Super Admin only',
  contract: (v: string) => `Signed contract · ${v}`,
  jobsiteDoc: (title: string) => `Jobsite document · ${title}`,
  insurance: 'Insurance certificate',
  empty: 'No documents to show.',
  emptyReports: "Reports built on the spot (P&L, schedule) aren't saved and don't show here.",
  more: 'Show more',
  error: "Couldn't load the documents. Try again.",
  errorOpen: "Couldn't open the document.",
};

export function getDocumentsLibraryStrings(locale: Locale): DocumentsLibraryStrings {
  return locale === 'en' ? documentsLibraryEn : documentsLibraryEs;
}
