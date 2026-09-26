import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, space } from '@/theme/tokens';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function tap(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
}

export function shake() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/** Primary action, shared by both auth screens: mint-tinted glass. */
export function AuthButton({ label, onPress, isLoading }: { label: string; onPress: () => void; isLoading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={isLoading ? undefined : onPress}
      disabled={isLoading}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          <Text style={styles.ctaLabel}>{label}</Text>
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            tintColor={colors.ink}
            size={18}
            weight="semibold"
          />
        </>
      )}
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, isLoading }: { label: string; onPress: () => void; isLoading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={isLoading ? undefined : onPress}
      disabled={isLoading}
      style={({ pressed }) => [styles.outlineCta, pressed && styles.ctaPressed]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.outlineCtaLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    height: 56,
    marginTop: space.xs,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.mint,
    boxShadow: '0 10px 28px rgba(143, 227, 117, 0.22)',
  },
  outlineCta: {
    height: 56,
    marginTop: space.xs,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  ctaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  ctaLabel: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 16.5,
    letterSpacing: 0.2,
  },
  outlineCtaLabel: {
    color: colors.text,
    fontFamily: font.display,
    fontSize: 16.5,
    letterSpacing: 0.2,
  },
});
