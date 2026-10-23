import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { Card } from './Card';
import { phoneDigits } from '@/lib/phone';
import { useTheme } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Ficha a la derecha (estado). */
  chip?: string;
  /** Cifra o línea extra en 800 (tarifa mensual del jobsite). */
  figure?: string;
  /** Llamar (tel:) y Correo (mailto:), como el detalle del lead (D-226). */
  contact?: { phone: string | null; email: string | null; callLabel: string; mailLabel: string };
  children?: ReactNode;
};

/** Tarjeta principal de marca de los detalles (D-226): título 24px/800, línea, ficha y botones de contacto. */
export function MainCard({ title, subtitle, chip, figure, contact, children }: Props) {
  const { brand } = useTheme();
  const phone = contact?.phone ? phoneDigits(contact.phone) : '';
  const email = contact?.email ?? '';
  return (
    <Card tone="brand" wide style={{ padding: 18, gap: 12, marginBottom: 12 }}>
      <View style={styles.head}>
        <View style={{ gap: 4, flex: 1 }}>
          <AppText weight="heavy" size={24} color="#FFFFFF" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
              {subtitle}
            </AppText>
          ) : null}
          {figure ? (
            <AppText weight="heavy" size={20} color="#FFFFFF" style={{ marginTop: 2 }}>
              {figure}
            </AppText>
          ) : null}
        </View>
        {chip ? (
          <View style={styles.chip}>
            <AppText size={12} weight="bold" color="#FFFFFF">
              {chip}
            </AppText>
          </View>
        ) : null}
      </View>
      {contact && (phone || email) ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="link"
            accessibilityState={{ disabled: !phone }}
            onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined}
            style={[styles.button, { backgroundColor: '#FFFFFF', opacity: phone ? 1 : 0.5 }]}
          >
            <Icon name="phone" size={18} strokeWidth={1.8} color={brand} />
            <AppText weight="bold" size={14} color={brand}>
              {contact.callLabel}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityState={{ disabled: !email }}
            onPress={email ? () => void Linking.openURL(`mailto:${email}`) : undefined}
            style={[styles.button, { backgroundColor: 'rgba(255,255,255,0.18)', opacity: email ? 1 : 0.5 }]}
          >
            <Icon name="mail" size={18} strokeWidth={1.8} color="#FFFFFF" />
            <AppText weight="bold" size={14} color="#FFFFFF">
              {contact.mailLabel}
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  chip: { borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  button: { flex: 1, height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
