import { fireEvent, render, screen } from '@testing-library/react-native';

import { Keypad } from './Keypad';

// La tecla vacía se oculta a los lectores de pantalla a propósito.
const HIDDEN = { includeHiddenElements: true };

describe('Keypad', () => {
  test('staff (showResend=false, D-155): sin tecla Reenviar, tecla vacía abajo a la izquierda y Borrar abajo a la derecha', async () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    await render(<Keypad onDigit={onDigit} onDelete={onDelete} deleteLabel="Borrar" showResend={false} />);

    expect(screen.queryByText('Reenviar')).toBeNull();
    expect(screen.getByTestId('keypad-empty-key', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Borrar')).toBeTruthy();
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(screen.getByText(d)).toBeTruthy();
    }

    // La tecla vacía no hace nada.
    await fireEvent.press(screen.getByTestId('keypad-empty-key', HIDDEN));
    expect(onDigit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('7'));
    expect(onDigit).toHaveBeenCalledWith('7');
    await fireEvent.press(screen.getByText('Borrar'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('portal del quote (por defecto, D-040): conserva la tecla Reenviar', async () => {
    const onResend = jest.fn();
    await render(
      <Keypad onDigit={jest.fn()} onDelete={jest.fn()} deleteLabel="Borrar" onResend={onResend} resendLabel="Reenviar" />,
    );
    expect(screen.queryByTestId('keypad-empty-key', HIDDEN)).toBeNull();
    await fireEvent.press(screen.getByText('Reenviar'));
    expect(onResend).toHaveBeenCalledTimes(1);
  });
});
