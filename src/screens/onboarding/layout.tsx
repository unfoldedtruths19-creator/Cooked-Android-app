import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentText } from '@/components/app/accent-text';
import { AppBackground } from '@/components/app/app-background';
import { blur, colors, font, radius, space } from '@/theme/tokens';

export const TOTAL_STEPS = 4;

type OnboardingLayoutProps = {
  step: number;
  title: string;
  /** One word from the title, painted in the brand accent. */
  highlight: string;
  subtitle: string;
  children: ReactNode;
  note?: string;
  continueLabel?: string;
  canContinue: boolean;
  onContinue: () => void;
};

/**
 * Shared chrome for onboarding: brand row with step pills up top, the question
 * block, the answers, then a fixed Back / Continue bar.
 */
export function OnboardingLayout({
  step,
  title,
  highlight,
  subtitle,
  children,
  note,
  continueLabel = 'Continue',
  canContinue,
  onContinue,
}: OnboardingLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <AppBackground />

      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Image
              source={require('@/assets/images/cookedmark.png')}
              style={styles.markImage}
              contentFit="contain"
              transition={160}
              accessibilityLabel="Cooked"
            />
          </View>
          <Text style={styles.wordmark}>COOKED</Text>
        </View>
        <View style={styles.pills}>
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <View
              key={index}
              style={[
                styles.pill,
                index + 1 === step && styles.pillActive,
                index + 1 < step && styles.pillDone,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={styles.step}>
            STEP {step} OF {TOTAL_STEPS}
          </Text>
          <View style={styles.titleRow}>
            {title.split(' ').map((word, index) => {
              const bare = word.replace(/[^A-Za-z-]/g, '').toLowerCase();
              return bare === highlight.toLowerCase() ? (
                <AccentText key={index} style={styles.title}>
                  {word}
                </AccentText>
              ) : (
                <Text key={index} style={styles.title}>
                  {word}
                </Text>
              );
            })}
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {children}

        {note ? (
          <View style={styles.note}>
            <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <BlurView intensity={blur.bar} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
          <SymbolView
            name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={colors.text}
            size={17}
            weight="semibold"
          />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={continueLabel}
          accessibilityState={{ disabled: !canContinue }}
          disabled={!canContinue}
          onPress={onContinue}
          style={({ pressed }) => [
            styles.next,
            !canContinue && styles.nextDisabled,
            pressed && styles.pressed,
          ]}
        >
          {!canContinue ? (
            <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
          <Text style={[styles.nextLabel, !canContinue && styles.nextLabelDisabled]}>
            {continueLabel}
          </Text>
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            tintColor={canContinue ? colors.ink : colors.muted}
            size={17}
            weight="semibold"
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  markImage: {
    width: 28,
    height: 28,
  },
  wordmark: {
    color: colors.text,
    fontFamily: font.displayHeavy,
    fontSize: 15,
    letterSpacing: 2.6,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pill: {
    width: 14,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(173, 226, 210, 0.16)',
  },
  pillDone: {
    backgroundColor: 'rgba(143, 227, 117, 0.45)',
  },
  pillActive: {
    width: 26,
    backgroundColor: colors.mint,
  },
  scroll: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  intro: {
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  step: {
    color: colors.mint,
    fontFamily: font.bodySemi,
    fontSize: 11.5,
    letterSpacing: 3,
  },
  title: {
    color: colors.text,
    fontFamily: font.displayHeavy,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1,
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 10,
  },
  subtitle: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: 15.5,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 330,
    alignSelf: 'center',
  },
  note: {
    borderRadius: radius.field,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
    overflow: 'hidden',
    padding: space.md,
  },
  noteText: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.glassLine,
    backgroundColor: colors.glassBar,
    overflow: 'hidden',
  },
  back: {
    flex: 1,
    height: 56,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  backLabel: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 15,
  },
  next: {
    flex: 1.35,
    height: 56,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.mint,
    boxShadow: '0 10px 28px rgba(143, 227, 117, 0.22)',
  },
  nextDisabled: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassLine,
    boxShadow: 'none',
  },
  nextLabel: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  nextLabelDisabled: {
    color: colors.muted,
  },
  pressed: {
    opacity: 0.85,
  },
});
