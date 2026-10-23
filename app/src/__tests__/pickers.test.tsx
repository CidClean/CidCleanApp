import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { DateField, TimeField, type Clock } from '@/components/PickerField';
import { PhoneField } from '@/components/PhoneField';
import { SelectField } from '@/components/SelectField';
import { walkthroughRowState } from '@/components/walkthrough/LeadWalkthroughs';
import { dayKey, type LeadSite } from '@/lib/leadRules';
import { newDoc } from '@/lib/walkthroughRules';

const calendar = { months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], weekDays: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], previousMonth: 'Mes anterior', nextMonth: 'Mes siguiente' };

describe('Campo desplegable encima de la pantalla (D-217)', () => {
  it('las opciones se abren en una hoja con el nombre del campo y se cierra al elegir', async () => {
    const onChange = jest.fn();
    await render(
      <SelectField
        label="Fuente"
        options={[
          { value: 'web', label: 'Web' },
          { value: 'manual', label: 'Manual' },
        ]}
        value="manual"
        onChange={onChange}
      />,
    );
    expect(screen.queryByText('Web')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Fuente'));
    // Título de la hoja + etiqueta del campo.
    expect(screen.getAllByText('Fuente')).toHaveLength(2);
    await fireEvent.press(screen.getByText('Web'));
    expect(onChange).toHaveBeenCalledWith('web');
    expect(screen.queryByText('Web')).toBeNull();
  });
});

describe('Selectores de fecha y hora (D-216)', () => {
  it('la fecha se elige en el calendario y se puede quitar', async () => {
    const onChange = jest.fn();
    const today = dayKey(new Date());
    const { rerender } = await render(
      <DateField label="Seguimiento" value={null} onChange={onChange} format={(k) => `F ${k}`} placeholder="Sin fecha" calendar={calendar} clearLabel="Quitar fecha" />,
    );
    expect(screen.getByText('Sin fecha')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Seguimiento'));
    await fireEvent.press(screen.getByLabelText(today));
    expect(onChange).toHaveBeenLastCalledWith(today);
    await rerender(
      <DateField label="Seguimiento" value={today} onChange={onChange} format={(k) => `F ${k}`} placeholder="Sin fecha" calendar={calendar} clearLabel="Quitar fecha" />,
    );
    expect(screen.getByText(`F ${today}`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Seguimiento'));
    await fireEvent.press(screen.getByText('Quitar fecha'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('la hora: hora, minutos de 5 en 5 y AM / PM, y Listo', async () => {
    let value: Clock | null = null;
    const onChange = jest.fn((v: Clock) => (value = v));
    await render(
      <TimeField
        label="Hora"
        value={null}
        onChange={onChange}
        format={(v) => `${v.hours}:${v.minutes}`}
        placeholder="Elegir hora"
        strings={{ hour: 'Hora', minutes: 'Minutos', done: 'Listo' }}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Hora'));
    expect(screen.getAllByRole('radio')).toHaveLength(24);
    await fireEvent.press(screen.getByLabelText('Hora 2'));
    await fireEvent.press(screen.getByLabelText('Minutos 35'));
    await fireEvent.press(screen.getByText('PM'));
    await fireEvent.press(screen.getByText('Listo'));
    expect(value).toEqual({ hours: 14, minutes: 35 });
  });

  it('12 AM es medianoche y 12 PM mediodía', async () => {
    const onChange = jest.fn();
    await render(
      <TimeField label="Hora" value={{ hours: 9, minutes: 7 }} onChange={onChange} format={() => 'x'} placeholder="" strings={{ hour: 'Hora', minutes: 'Minutos', done: 'Listo' }} />,
    );
    await fireEvent.press(screen.getByLabelText('Hora'));
    // 9:07 abre en 9:05 (minutos de 5 en 5).
    expect(screen.getByLabelText('Minutos 05').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Hora 12'));
    await fireEvent.press(screen.getByText('Listo'));
    expect(onChange).toHaveBeenLastCalledWith({ hours: 0, minutes: 5 });
  });

  it('el teléfono se formatea mientras se escribe', async () => {
    const onChange = jest.fn();
    await render(<PhoneField label="Teléfono" value="" onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('Teléfono'), '2395550142');
    expect(onChange).toHaveBeenCalledWith('(239) 555-0142');
  });
});

describe('Walkthrough visible desde Sitios (D-217)', () => {
  const site: LeadSite = { id: 's1', name: 'Oficina', address: '1 Main', scheduled: null, walkthroughDone: false };
  const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
  it('lo del teléfono manda; si no hay, lo del servidor', () => {
    expect(walkthroughRowState(site, undefined)).toBeNull();
    expect(walkthroughRowState({ ...site, walkthroughDone: true }, undefined)).toBe('closed');
    expect(walkthroughRowState(site, doc)).toBe('draft');
    expect(walkthroughRowState(site, { ...doc, closeRequested: true })).toBe('closing');
    expect(walkthroughRowState(site, { ...doc, status: 'closed', version: 1 })).toBe('closed');
  });
});
