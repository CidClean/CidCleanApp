import { act, renderHook } from '@testing-library/react-native';

import { CODE_LENGTH, sanitizeCode, useCodeEntry } from './codeEntry';

describe('sanitizeCode (solo dígitos, máximo 6)', () => {
  test('filtra cualquier carácter que no sea dígito', () => {
    expect(sanitizeCode('12a3-4 5')).toBe('12345');
    expect(sanitizeCode('abc')).toBe('');
    expect(sanitizeCode('１２３')).toBe(''); // dígitos de ancho completo no cuentan
  });
  test('corta en 6, también al pegar más', () => {
    expect(CODE_LENGTH).toBe(6);
    expect(sanitizeCode('1234567890')).toBe('123456');
    expect(sanitizeCode('123 456')).toBe('123456');
  });
});

describe('useCodeEntry', () => {
  test('teclear dígito a dígito: verifica solo al sexto', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useCodeEntry(onComplete));
    for (const text of ['4', '48', '482', '4821', '48215']) {
      await act(async () => result.current.onChangeText(text));
      expect(onComplete).not.toHaveBeenCalled();
    }
    await act(async () => result.current.onChangeText('482159'));
    expect(result.current.value).toBe('482159');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482159');
  });

  test('pegar 6 dígitos de golpe verifica de inmediato', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useCodeEntry(onComplete));
    await act(async () => result.current.onChangeText('123456'));
    expect(result.current.value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  test('pegar texto con espacios o letras deja solo los dígitos; con menos de 6 no verifica', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useCodeEntry(onComplete));
    await act(async () => result.current.onChangeText('Código: 12 34'));
    expect(result.current.value).toBe('1234');
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => result.current.onChangeText('123 456 789'));
    expect(result.current.value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  test('borrar un dígito baja el valor y no verifica', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useCodeEntry(onComplete));
    await act(async () => result.current.onChangeText('123'));
    await act(async () => result.current.onChangeText('12'));
    expect(result.current.value).toBe('12');
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('reset limpia las casillas y devuelve el foco al TextInput', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useCodeEntry(onComplete));
    const focus = jest.fn();
    result.current.inputRef.current = { focus };
    await act(async () => result.current.onChangeText('123456'));
    await act(async () => result.current.reset());
    expect(result.current.value).toBe('');
    expect(focus).toHaveBeenCalledTimes(1);
    // tras el error se puede escribir otro código y verifica otra vez
    await act(async () => result.current.onChangeText('654321'));
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith('654321');
  });

  test('focus enfoca el TextInput (tocar las casillas)', async () => {
    const { result } = await renderHook(() => useCodeEntry(jest.fn()));
    const focus = jest.fn();
    result.current.inputRef.current = { focus };
    result.current.focus();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
