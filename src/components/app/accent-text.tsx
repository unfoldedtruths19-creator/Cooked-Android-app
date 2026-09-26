import { Text, type TextStyle } from 'react-native';

import { colors } from '@/theme/tokens';

/** One word lifted out of a headline in the brand mint. Flat colour, no gradient. */
export function AccentText({ children, style }: { children: string; style: TextStyle }) {
  return <Text style={[style, { color: colors.mint }]}>{children}</Text>;
}
