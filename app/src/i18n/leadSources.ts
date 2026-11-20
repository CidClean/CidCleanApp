import type { Locale } from './index';

/**
 * Mi cuenta → Lead sources (orden 163, D-350 (5), survey leads-fuentes-aprobado pantalla 5). Solo el Super Admin.
 * El survey está en inglés: el inglés sale de él; el español es su traducción (D-200).
 */
export const leadSourcesEs = {
  row: 'Fuentes de leads', // D-200 (D-350: "Lead sources")
  title: 'Fuentes de leads', // D-200
  enters: (as: string) => `Entra como ${as}`, // D-200 (D-350: "Enters as")
  potential: 'Potencial', // D-200
  cold: 'En frío', // D-200
  viaMake: 'vía Make', // D-200 (survey: "via Make")
  leads: (n: number) => (n === 1 ? '1 lead' : `${n} leads`), // D-200 (survey: "34 leads")
  notUsed: 'sin usar todavía', // D-200 (survey: "not used yet")
  active: (name: string) => `${name} activa`, // D-200 (lector de pantalla del interruptor)
  entersAs: 'Entra como', // D-200
  add: '+ Agregar fuente', // D-200 (D-350: "+ Add source")
  connection: (name: string) => `${name} · conexión`, // D-200 (survey: "Muse · connection")
  connectionNote: 'Dirección web y clave para pegar en el agente o en Make', // D-200 (survey)
  address: 'Dirección web', // D-200
  key: 'Clave', // D-200
  keyHidden: (last4: string) => `••••${last4}`, // D-200: después de crearla solo se ven los últimos 4
  noKey: 'Sin clave todavía: rehazla para conectar la fuente.', // D-200
  keyOnce: 'Copia la clave ahora: después solo se ven los últimos 4 caracteres.', // D-200
  copy: 'Copiar', // D-200 (D-350: "Copy")
  copied: 'Copiado', // D-200
  remakeKey: 'Rehacer clave', // D-200 (D-350: "se puede rehacer")
  remakeTitle: (name: string) => `¿Rehacer la clave de ${name}?`, // D-200
  remakeBody: 'La clave actual deja de funcionar al momento. Tendrás que pegar la nueva en el agente o en Make.', // D-200
  remakeYes: 'Rehacer', // D-200
  cancel: 'Cancelar', // D-200
  newTitle: 'Nueva fuente', // D-200
  name: 'Nombre', // D-200
  kind: 'Tipo', // D-200
  kinds: { ads: 'Anuncios', agent: 'Agente de IA', other: 'Otra' }, // D-200 (tipos de la orden 160)
  create: 'Crear fuente', // D-200
  errorName: 'Escribe el nombre (hasta 60 caracteres).', // D-200
  errorDuplicate: 'Ya existe una fuente con ese nombre.', // D-200
  errorLoad: 'No se pudieron cargar las fuentes. Inténtalo otra vez.', // D-200 (patrón D-178)
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // D-200 (D-195)
  empty: 'Todavía no hay fuentes.', // D-200
};

export type LeadSourcesStrings = typeof leadSourcesEs;

export const leadSourcesEn: LeadSourcesStrings = {
  row: 'Lead sources', // D-350 (5)
  title: 'Lead sources',
  enters: (as: string) => `Enters as ${as}`, // D-350 (5)
  potential: 'Potential',
  cold: 'Cold',
  viaMake: 'via Make', // survey
  leads: (n: number) => (n === 1 ? '1 lead' : `${n} leads`),
  notUsed: 'not used yet', // survey
  active: (name: string) => `${name} active`,
  entersAs: 'Enters as',
  add: '+ Add source', // D-350 (5)
  connection: (name: string) => `${name} · connection`, // survey
  connectionNote: 'Web address and key to paste in the agent or in Make', // survey
  address: 'Web address',
  key: 'Key',
  keyHidden: (last4: string) => `••••${last4}`,
  noKey: 'No key yet: remake it to connect the source.',
  keyOnce: 'Copy the key now: afterwards only the last 4 characters are shown.',
  copy: 'Copy', // D-350 (5)
  copied: 'Copied',
  remakeKey: 'Remake key',
  remakeTitle: (name: string) => `Remake the key for ${name}?`,
  remakeBody: "The current key stops working right away. You'll need to paste the new one in the agent or in Make.",
  remakeYes: 'Remake',
  cancel: 'Cancel',
  newTitle: 'New source',
  name: 'Name',
  kind: 'Type',
  kinds: { ads: 'Ads', agent: 'AI agent', other: 'Other' },
  create: 'Create source',
  errorName: 'Enter the name (up to 60 characters).',
  errorDuplicate: 'A source with that name already exists.',
  errorLoad: "Couldn't load the sources. Try again.",
  errorSave: "Couldn't save. Try again.",
  empty: 'No sources yet.',
};

export function getLeadSourcesStrings(l: Locale): LeadSourcesStrings {
  return l === 'es' ? leadSourcesEs : leadSourcesEn;
}
