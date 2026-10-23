import { Text, type TextProps } from 'react-native';

import { density, fonts, useTheme } from '@/theme';

type Props = TextProps & {
  /** heavy = Manrope 800 (D-223: títulos y cifras); bold = 700 (títulos de tarjeta). */
  weight?: 'regular' | 'medium' | 'bold' | 'heavy';
  size?: number;
  color?: string;
  center?: boolean;
};

export function AppText({ weight = 'regular', size = density.text, color, center, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fontFor(weight, size),
          fontSize: size,
          color: color ?? colors.text,
          lineHeight: Math.round(size * 1.4),
        },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}

/**
 * D-223: los títulos y cifras van en Manrope 800. Un texto en medio peso de 16px o más (títulos de pantalla y de
 * sección, cifras) pasa a 800 en toda la app sin tocar cada pantalla; el texto corriente sigue en 400 y 500.
 */
export function fontFor(weight: NonNullable<Props['weight']>, size: number): string {
  if (weight === 'heavy') return fonts.heavy;
  if (weight === 'bold') return fonts.bold;
  if (weight === 'medium') return size >= 16 ? fonts.heavy : fonts.medium;
  return fonts.regular;
}
