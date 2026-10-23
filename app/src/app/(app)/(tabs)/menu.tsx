import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Bento, Card, useCardText, type CardTone } from '@/components/bento/Card';
import { TitleHeader } from '@/components/bento/Header';
import { Icon } from '@/components/Icon';
import { BellIcon, ChartIcon, ClockIcon, GearIcon, PeopleIcon, ScheduleArt } from '@/components/illustrations';
import { SignOutDialog } from '@/components/SignOutDialog';
import { useStrings } from '@/i18n/useStrings';
import { roleLabel } from '@/lib/employeeLabels';
import type { RoleKey } from '@/lib/employeeRules';
import { fetchEmployees } from '@/lib/employeesApi';
import { usePermissions, useSession } from '@/lib/session';
import { visibleMenuItems, type MenuKey } from '@/lib/visibility';
import { iconStrokeWidth, illustrations, radius, useTheme } from '@/theme';

/**
 * Menú (D-134, D-222, D-226; muestra surveys/estilo-c1-pantallas/Menu.html): perfil arriba, mosaico de tarjetas
 * con icono ilustrado y un dato vivo (Schedule y Work grande en marca; Empleados, Accounting, Notificaciones e
 * Historial), Ajustes en fila y Cerrar sesión como botón al final. Solo los destinos con permiso. Un dato que aún
 * no existe (visitas de la semana, profit, avisos sin leer) no se muestra.
 */
export default function MenuScreen() {
  const router = useRouter();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const { profile } = useSession();
  const items = visibleMenuItems(access);
  const [confirming, setConfirming] = useState(false);
  const [activeEmployees, setActiveEmployees] = useState<number | null>(null);
  const seesEmployees = items.includes('employees');

  useFocusEffect(
    useCallback(() => {
      if (!seesEmployees) return;
      let cancelled = false;
      void fetchEmployees().then((r) => {
        if (!cancelled && r.ok) setActiveEmployees(r.data.filter((e) => e.active).length);
      });
      return () => {
        cancelled = true;
      };
    }, [seesEmployees]),
  );

  function open(key: MenuKey) {
    if (key === 'profile') router.push('/profile');
    else if (key === 'employees') router.push('/employees');
    else if (key === 'settings') router.push('/settings');
    else if (key === 'history') router.push('/history');
    else if (key === 'scheduleWork') router.push('/schedule');
    else router.push({ pathname: '/section/[key]', params: { key } });
  }

  const name = profile?.fullName ?? '';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const role = roleLabel(strings, (profile?.role ?? 'employee') as RoleKey, profile?.isSuperAdmin ?? false);

  const tile = (key: MenuKey, tone: CardTone, icon: ReactNode, line: string | null) => (
    <Tile key={key} tone={tone} icon={icon} title={strings.nav[key]} line={line} onPress={() => open(key)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TitleHeader
        title={strings.nav.menu}
        left={
          <Pressable accessibilityRole="button" accessibilityLabel={strings.nav.profile} onPress={() => open('profile')} style={styles.profile}>
            <View style={[styles.avatar, { backgroundColor: brand }]}>
              <AppText weight="bold" size={17} color="#FFFFFF">
                {initials}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="heavy" size={20} accessibilityRole="header">
                {name}
              </AppText>
              <AppText size={13} color={colors.secondary}>
                {strings.menu.profileLine(role)}
              </AppText>
            </View>
            <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.secondary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.page}>
        <Bento>
          {items.includes('scheduleWork') ? (
            <Card tone="brand" wide onPress={() => open('scheduleWork')} accessibilityLabel={strings.nav.scheduleWork} style={[styles.big, illustrations ? styles.bigArt : null]}>
              <View style={{ gap: 4, paddingBottom: illustrations ? 16 : 0, flexShrink: 1 }}>
                <AppText weight="heavy" size={20} color="#FFFFFF">
                  {strings.nav.scheduleWork}
                </AppText>
              </View>
              <ScheduleArt />
            </Card>
          ) : null}
          {items.includes('employees') ? tile('employees', 'plain', <PeopleIcon />, activeEmployees === null ? null : strings.menu.activeEmployees(activeEmployees)) : null}
          {items.includes('accounting') ? tile('accounting', 'dark', <ChartIcon />, null) : null}
          {tile('notifications', 'attention', <BellIcon />, null)}
          {items.includes('history') ? tile('history', 'plain', <ClockIcon />, strings.menu.historyLine) : null}
          {items.includes('settings') ? (
            <Card wide onPress={() => open('settings')} accessibilityLabel={strings.nav.settings} style={styles.row}>
              <GearIcon />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size={15}>
                  {strings.nav.settings}
                </AppText>
                <AppText size={12} color={colors.secondary}>
                  {strings.menu.settingsLine}
                </AppText>
              </View>
              <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.secondary} />
            </Card>
          ) : null}
          {/* D-222 a: Cerrar sesión al final, con la ventana al centro. */}
          <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.signOut, { borderColor: colors.border }]}>
            <Icon name="logout" size={20} strokeWidth={1.6} color={SIGN_OUT} />
            <AppText weight="bold" size={15} color={SIGN_OUT}>
              {strings.profile.signOut}
            </AppText>
          </Pressable>
        </Bento>
      </ScrollView>
      <SignOutDialog visible={confirming} onClose={() => setConfirming(false)} />
    </View>
  );
}

/** Rojo del botón Cerrar sesión de la muestra D-226. */
const SIGN_OUT = '#B0473F';

function Tile({ tone, icon, title, line, onPress }: { tone: CardTone; icon: ReactNode; title: string; line: string | null; onPress: () => void }) {
  const t = useCardText(tone);
  return (
    <Card tone={tone} onPress={onPress} accessibilityLabel={title} style={styles.tile}>
      {icon}
      <View style={{ gap: 2 }}>
        <AppText weight="heavy" size={16} color={t.main}>
          {title}
        </AppText>
        {line ? (
          <AppText size={12} color={t.soft} style={{ opacity: t.softOpacity }}>
            {line}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  profile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  big: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigArt: { height: 120, paddingRight: 0, paddingBottom: 0, alignItems: 'flex-end' },
  tile: { gap: 12, minHeight: 132, justifyContent: 'space-between' },
  row: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  signOut: { width: '100%', height: 52, borderWidth: 1, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
