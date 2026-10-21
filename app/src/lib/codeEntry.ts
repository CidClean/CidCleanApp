import { useCallback, useRef, useState } from 'react';

export const CODE_LENGTH = 6;

type Focusable = { focus: () => void };

/** Deja solo dígitos y corta en `length`: sirve para teclear, para pegar y para el autocompletado del teléfono. */
export function sanitizeCode(raw: string, length: number = CODE_LENGTH): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

/**
 * Estado del código que se escribe en un TextInput real y oculto (D-163).
 * `onComplete` se llama una vez al llegar al último dígito (tecleado o pegado de golpe).
 */
export function useCodeEntry(onComplete: (code: string) => void, length: number = CODE_LENGTH) {
  const [value, setValue] = useState('');
  const inputRef = useRef<Focusable | null>(null);

  const onChangeText = useCallback(
    (text: string) => {
      const code = sanitizeCode(text, length);
      setValue(code);
      if (code.length === length) onComplete(code);
    },
    [length, onComplete],
  );

  const focus = useCallback(() => inputRef.current?.focus(), []);

  /** Limpia las casillas y devuelve el foco al TextInput (tras un error o un reenvío). */
  const reset = useCallback(() => {
    setValue('');
    inputRef.current?.focus();
  }, []);

  return { value, onChangeText, inputRef, focus, reset };
}
