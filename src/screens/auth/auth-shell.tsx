import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/app/app-background';
import { blur, colors, font, radius, space } from '@/theme/tokens';

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText: string;
  footerAction: string;
  onFooterPress: () => void;
};

/**
 * Shared frame for the auth screens: ambient brand glows, the frosted card,
 * and the one-line footer that swaps between sign up and log in.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footerText,
  footerAction,
  onFooterPress,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const blurTarget = useRef<View | null>(null);

  return (
    <View style={styles.screen}>
      <AppBackground blurRef={blurTarget} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + (compact ? space.md : space.xl) },
            { paddingBottom: insets.bottom + space.lg },
          ]}
        >
          <View style={styles.content}>
            <Image
              source={require('@/assets/images/cookedlogo.png')}
              style={[styles.logo, compact && styles.logoCompact]}
              contentFit="contain"
              transition={220}
              accessibilityLabel="Cooked — focus over scroll"
            />

            <View style={styles.card}>
              <BlurView
                intensity={blur.card}
                tint="dark"
                blurTarget={blurTarget}
                blurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardWash} pointerEvents="none" />

              <View style={styles.cardInner}>
                <View style={styles.heading}>
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.subtitle}>{subtitle}</Text>
                </View>
                {children}
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{footerText} </Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={footerAction}
                hitSlop={12}
                onPress={onFooterPress}
                style={({ pressed }) => (pressed ? styles.footerPressed : null)}
              >
                <Text style={styles.footerLink}>{footerAction}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: space.lg,
  },
  logo: {
    width: '100%',
    height: 172,
    alignSelf: 'center',
  },
  logoCompact: {
    height: 132,
  },
  card: {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
  },
  cardWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.glass,
  },
  cardInner: {
    padding: space.lg,
    gap: space.md,
  },
  heading: {
    gap: space.xs,
    marginBottom: space.xs,
  },
  title: {
    color: colors.text,
    fontFamily: font.display,
    fontSize: 26,
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 14,
  },
  footerLink: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 14,
  },
  footerPressed: {
    opacity: 0.6,
  },
});
