import type { ReactNode } from 'react';

import { Dialog } from './Dialog';

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

/**
 * D-229: las antiguas hojas desde abajo ahora son la ventana al centro (Dialog). Se conserva el nombre para que todas
 * las pantallas usen el mismo componente compartido sin cambios.
 */
export function Sheet({ visible, onClose, children }: Props) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      {children}
    </Dialog>
  );
}
