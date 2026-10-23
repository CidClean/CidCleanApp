import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { MonthCalendar } from './sales/MonthCalendar';
import { canGoToPreviousMonth, dateFromKey, monthGrid, shiftMonth } from '@/lib/leadRules';
import { density, iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Selectores de fecha y hora (D-216): nunca se escribe un formato. El campo se ve como los demás (D-030, con el
 * icono a la derecha como el campo desplegable) y al tocarlo abre una hoja (Sheet, muestra ronda 15).
 * Todo en JS: sin módulos nativos nuevos.
 */

type BoxProps = { label: string; text: string; placeholder: boolean; icon: IconName; error?: string | null; onPress: () => void };

function FieldBox({ label, text, placeholder, icon, error, onPress }: BoxProps) {
  const { colors, status } = useTheme();
  return (
    <View style={styles.wrap}>
      <AppText size={sample.labelSize} color={colors.secondary} style={styles.label}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text }}
        onPress={onPress}
        style={[styles.box, { borderColor: error ? status.error : colors.fieldBorder }]}
      >
        <AppText color={placeholder ? colors.secondary : colors.text}>{text}</AppText>
        <Icon name={icon} size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
      </Pressable>
      {error ? (
        <AppText size={sample.noteSize} color={status.error} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

// --- Fecha ------------------------------------------------------------------------------------------------

export type CalendarStrings = {
  months: readonly string[];
  weekDays: readonly string[];
  previousMonth: string;
  nextMonth: string;
};

type DateProps = {
  label: string;
  /** AAAA-MM-DD o null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Cómo se muestra la fecha elegida en el campo. */
  format: (key: string) => string;
  placeholder: string;
  calendar: CalendarStrings;
  /** Si la fecha es opcional: texto del botón que la quita. */
  clearLabel?: string;
  error?: string | null;
};

/** Campo de fecha: abre el calendario del mes existente (D-072, D-104) en una hoja; días pasados no se eligen. */
export function DateField({ label, value, onChange, format, placeholder, calendar, clearLabel, error }: DateProps) {
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const start = value ? dateFromKey(value) : today;
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });

  function show() {
    const d = value ? dateFromKey(value) : today;
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(true);
  }

  const weeks = monthGrid(view.year, view.month, today, new Set(), value);
  return (
    <>
      <FieldBox label={label} text={value ? format(value) : placeholder} placeholder={!value} icon="calendar" error={error} onPress={show} />
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 10 }}>
          {label}
        </AppText>
        <MonthCalendar
          title={`${calendar.months[view.month]} ${view.year}`}
          weekDays={calendar.weekDays}
          weeks={weeks}
          onSelect={(key) => {
            onChange(key);
            setOpen(false);
          }}
          onPrevious={canGoToPreviousMonth(view.year, view.month, today) ? () => setView((v) => shiftMonth(v.year, v.month, -1)) : undefined}
          onNext={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          previousLabel={calendar.previousMonth}
          nextLabel={calendar.nextMonth}
        />
        {clearLabel && value ? (
          <AppButton
            label={clearLabel}
            variant="outline"
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

// --- Hora -------------------------------------------------------------------------------------------------

export type Clock = { hours: number; minutes: number };

export type TimeStrings = { hour: string; minutes: string; done: string };

type TimeProps = {
  label: string;
  value: Clock | null;
  onChange: (value: Clock) => void;
  format: (value: Clock) => string;
  placeholder: string;
  strings: TimeStrings;
  error?: string | null;
};

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
/** Hora con la que abre el selector si el campo está vacío (delegado D-200): 10:00 AM, el ejemplo aprobado. */
const DEFAULT_CLOCK: Clock = { hours: 10, minutes: 0 };

function toParts(c: Clock): { h12: number; minute: number; pm: boolean } {
  return { h12: c.hours % 12 === 0 ? 12 : c.hours % 12, minute: Math.floor(c.minutes / 5) * 5, pm: c.hours >= 12 };
}

function fromParts(h12: number, minute: number, pm: boolean): Clock {
  const base = h12 === 12 ? 0 : h12;
  return { hours: pm ? base + 12 : base, minutes: minute };
}

/** Campo de hora: hoja con la hora (1 a 12), los minutos de 5 en 5 y AM / PM, y el botón Listo. */
export function TimeField({ label, value, onChange, format, placeholder, strings, error }: TimeProps) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(toParts(value ?? DEFAULT_CLOCK));

  function show() {
    setParts(toParts(value ?? DEFAULT_CLOCK));
    setOpen(true);
  }

  return (
    <>
      <FieldBox label={label} text={value ? format(value) : placeholder} placeholder={!value} icon="clock" error={error} onPress={show} />
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 10 }}>
          {label}
        </AppText>
        <Grid
          title={strings.hour}
          items={HOURS.map((h) => ({ key: h, label: String(h) }))}
          selected={parts.h12}
          onSelect={(h12) => setParts({ ...parts, h12 })}
        />
        <Grid
          title={strings.minutes}
          items={MINUTES.map((m) => ({ key: m, label: String(m).padStart(2, '0') }))}
          selected={parts.minute}
          onSelect={(minute) => setParts({ ...parts, minute })}
        />
        <Segmented
          options={[
            { value: 'am', label: 'AM' },
            { value: 'pm', label: 'PM' },
          ]}
          value={parts.pm ? 'pm' : 'am'}
          onChange={(v) => setParts({ ...parts, pm: v === 'pm' })}
        />
        <AppButton
          label={strings.done}
          onPress={() => {
            onChange(fromParts(parts.h12, parts.minute, parts.pm));
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

type GridProps = { title: string; items: { key: number; label: string }[]; selected: number; onSelect: (key: number) => void };

/** Botones como el selector de días (D-038): esquinas de 8px, contorno al 32% y el elegido con fondo de marca. */
function Grid({ title, items, selected, onSelect }: GridProps) {
  const { colors, brand } = useTheme();
  const rows = [items.slice(0, 6), items.slice(6)];
  return (
    <View style={{ marginBottom: 10 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={styles.label}>
        {title}
      </AppText>
      {rows.map((row, r) => (
        <View key={r} style={[styles.gridRow, r > 0 ? { marginTop: 4 } : null]}>
          {row.map((it) => {
            const on = it.key === selected;
            return (
              <Pressable
                key={it.key}
                accessibilityRole="radio"
                accessibilityLabel={`${title} ${it.label}`}
                accessibilityState={{ checked: on }}
                onPress={() => onSelect(it.key)}
                style={[styles.cell, on ? { backgroundColor: brand, borderColor: brand } : { borderColor: colors.fieldBorder }]}
              >
                <AppText size={14} weight={on ? 'medium' : 'regular'} color={on ? '#FFFFFF' : colors.text} center>
                  {it.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  label: { marginBottom: 3 },
  box: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: density.fieldPaddingVertical,
    paddingHorizontal: sample.fieldHorizontalPadding,
    minHeight: sample.fieldLineHeight + density.fieldPaddingVertical * 2 + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: { marginTop: 4 },
  gridRow: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
});
