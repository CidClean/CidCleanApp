import { useRouter } from 'expo-router';

/** Acción de la flecha de volver (D-180): vuelve a la pantalla anterior o, si no hay, a Inicio. */
export function useGoBack(): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
}
