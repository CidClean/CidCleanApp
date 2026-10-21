import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { SelectField } from './SelectField';
import { Switch } from './Switch';
import type { Strings } from '@/i18n/es';
import type { RoleKey } from '@/lib/employeeRules';
import type { AreaKey, AreaState, PermissionsMode, VisibleArea } from '@/lib/permissionsRules';
import { density, iconStrokeWidth, useTheme } from '@/theme';

type Props = {
  strings: Strings;
  mode: PermissionsMode;
  areas: readonly VisibleArea[];
  on: ReadonlySet<string>;
  onToggle: (key: string, value: boolean) => void;
  /** Plantilla de partida mostrada; null cuando no hay selector (solo lectura o bloqueada). */
  template: RoleKey | null;
  onTemplate: (role: RoleKey) => void;
};

const CHIP_TONE = { all: 'brand', partial: 'success', none: 'muted' } as const;

function chipLabel(strings: Strings, state: AreaState): string {
  return state === 'all' ? strings.permissions.chipAll : state === 'partial' ? strings.permissions.chipPartial : strings.permissions.chipNone;
}

/**
 * Pestaña Permisos (D-058, D-110, D-188 a D-192, D-194, muestra ronda 16): "Plantilla de partida" arriba, debajo las áreas
 * con su ficha Todo / Parcial / Sin acceso; cada área se abre y lista sus permisos con interruptor de 40px.
 * En el modo bloqueado (Super Admin) todo está encendido, con candado y sin acción.
 */
export function PermissionsTab({ strings, mode, areas, on, onToggle, template, onTemplate }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<ReadonlySet<AreaKey>>(new Set());
  const locked = mode === 'locked';
  const editable = mode === 'edit';

  function toggleArea(key: AreaKey) {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  }

  return (
    <View>
      {template !== null ? (
        <SelectField
          label={strings.permissions.template}
          options={[
            { value: 'employee', label: strings.employees.roleEmployee },
            { value: 'supervisor', label: strings.employees.roleSupervisor },
            { value: 'admin', label: strings.employees.roleAdmin },
          ]}
          value={template}
          onChange={(role) => {
            if (role !== template) onTemplate(role);
          }}
        />
      ) : null}
      {areas.map((area) => {
        const isOpen = open.has(area.key);
        const name = strings.permissions.areas[area.key];
        return (
          <View key={area.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={name}
              accessibilityState={{ expanded: isOpen }}
              onPress={() => toggleArea(area.key)}
              style={[styles.areaRow, { borderBottomColor: colors.border, borderBottomWidth: isOpen ? 0 : 0.5 }]}
            >
              <AppText weight="medium">{name}</AppText>
              <View style={styles.areaRight}>
                <Chip label={chipLabel(strings, area.state)} tone={CHIP_TONE[area.state]} />
                <Icon name="chevron-down" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
              </View>
            </Pressable>
            {isOpen
              ? area.keys.map((key) => {
                  const label = strings.permissions.labels[key as keyof Strings['permissions']['labels']];
                  return (
                    <View
                      key={key}
                      style={[styles.permRow, { borderBottomColor: colors.border }, locked ? styles.lockedRow : null]}
                    >
                      <AppText style={styles.permLabel}>{label}</AppText>
                      <View style={styles.permRight}>
                        {locked ? <Icon name="lock" size={16} strokeWidth={iconStrokeWidth} color={colors.text} /> : null}
                        <Switch
                          value={locked || on.has(key)}
                          accessibilityLabel={label}
                          disabled={!editable}
                          onChange={(value) => onToggle(key, value)}
                        />
                      </View>
                    </View>
                  );
                })
              : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  areaRow: {
    minHeight: density.row,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  areaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permRow: {
    minHeight: density.row,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 0.5,
  },
  permLabel: { flex: 1 },
  permRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedRow: { opacity: 0.45 },
});
