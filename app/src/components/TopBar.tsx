import type { ReactNode } from 'react';

import { BackHeader, TitleHeader } from './bento/Header';
import type { IconName } from './Icon';

/** Acción a la derecha de la barra: texto ("Editar", D-174) o icono (+, D-185). */
export type TopBarAction = {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
};

type Props = {
  title: string;
  /** Flecha de volver a la izquierda (D-180): se pone en las pantallas a las que se entra desde otra. */
  onBack?: () => void;
  backLabel?: string;
  action?: TopBarAction;
  /** Línea bajo el título (aviso de sincronización del walkthrough, D-091, D-119). */
  subtitle?: ReactNode;
};

/**
 * Barra superior de las pantallas internas. D-226: ya no es la barra de marca; sigue el lenguaje bento de las
 * muestras (fondo crema, botón blanco de volver de 44px, título 18px/800 y la acción en una pastilla blanca o un
 * cuadro de marca), con el área segura de arriba. Sin flecha de volver, el título va grande a la izquierda.
 */
export function TopBar({ title, onBack, backLabel, action, subtitle }: Props) {
  if (!onBack) {
    return (
      <TitleHeader
        title={title}
        action={action?.icon ? { icon: action.icon, label: action.accessibilityLabel, onPress: action.onPress } : undefined}
      />
    );
  }
  return (
    <BackHeader
      onBack={onBack}
      backLabel={backLabel ?? ''}
      title={title}
      subtitle={subtitle}
      action={
        action
          ? { label: action.label ?? action.accessibilityLabel, accessibilityLabel: action.accessibilityLabel, icon: action.icon, onPress: action.onPress }
          : undefined
      }
    />
  );
}
