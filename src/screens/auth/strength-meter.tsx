import { StyleSheet, Text, View } from 'react-native';

import { colors, font } from '@/theme/tokens';

const LABELS = ['Too short', 'Weak', 'Getting there', 'Solid', 'Strong'] as const;

export function scorePassword(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return password.length < 8 ? Math.min(score, 1) : score;
}

/** A mint bar that fills as the password gets stronger. */
export function StrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password);

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score * 25}%` }]} />
      </View>
      <Text style={styles.caption}>{password ? LABELS[score] : 'Strength'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    marginTop: -2,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(173, 226, 210, 0.12)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.mint,
  },
  caption: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 11.5,
    letterSpacing: 0.2,
  },
});
