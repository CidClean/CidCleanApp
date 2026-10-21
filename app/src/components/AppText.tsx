import { Text, type TextProps } from 'react-native';

import { density, fonts, useTheme } from '@/theme';

type Props = TextProps & {
  weight?: 'regular' | 'medium';
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
          fontFamily: weight === 'medium' ? fonts.medium : fonts.regular,
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
