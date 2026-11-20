// Entrada segura de leads de anuncios (Meta, TikTok vía Make) y agentes de IA (orden 160; D-347, D-348, D-350).
// Pública: verify_jwt desactivado (desplegar con --no-verify-jwt); la seguridad es la clave por fuente en el
// encabezado x-cidclean-key. Toda la lógica está en _shared/leadIntake.ts; la base (lead_intake, solo service role)
// valida el hash de la clave, limita por fuente, crea o junta los leads y avisa.
import { clienteDeServicio } from '../_shared/comun.ts';
import { manejar, type IntakeLead, type IntakeResult } from '../_shared/leadIntake.ts';

Deno.serve((req) => {
  const db = clienteDeServicio();
  return manejar(req, {
    intake: async (keyHash: string, leads: IntakeLead[]) => {
      const { data, error } = await db.rpc('lead_intake', { p_key_hash: keyHash, p_items: leads });
      if (error) throw new Error(error.message);
      return data as IntakeResult;
    },
  });
});
