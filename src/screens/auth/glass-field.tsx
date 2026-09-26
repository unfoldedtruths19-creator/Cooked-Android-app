import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { forwardRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { colors, font, radius, space } from '@/theme/tokens';

type GlassFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  icon: SymbolViewProps['name'];
  error?: string;
  isSecure?: boolean;
  onToggleSecure?: () => void;
};

/**
 * Single-line glass input. The signature detail: an unfocused field carries a
 * plain hairline, and on focus a mint hairline traces the whole edge while the
 * leading glyph warms from muted to mint.
 */
export const GlassField = forwardRef<TextInput, GlassFieldProps>(function GlassField(
  { label, icon, error, isSecure, onToggleSecure, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [focus] = useState(() => new Animated.Value(0));

  function animateTo(value: number) {
    Animated.timing(focus, {
      toValue: value,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={[styles.ring, error ? styles.ringError : null]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.ringFocus, { opacity: focus }]}
          pointerEvents="none"
        />

        <View style={[styles.inner, focused ? styles.innerFocused : null]}>
          <SymbolView
            name={icon}
            tintColor={focused ? colors.spring : colors.muted}
            size={20}
            weight="regular"
          />
          <TextInput
            ref={ref}
            {...inputProps}
            style={[styles.input, Platform.OS === 'web' ? webInputReset : null]}
            placeholderTextColor={colors.muted}
            selectionColor={colors.spring}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={(event) => {
              setFocused(true);
              animateTo(1);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              animateTo(0);
              onBlur?.(event);
            }}
          />
          {onToggleSecure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
              hitSlop={14}
              onPress={onToggleSecure}
              style={({ pressed }) => [styles.eye, pressed && styles.eyePressed]}
            >
              <SymbolView
                name={
                  isSecure
                    ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                    : { ios: 'eye', android: 'visibility', web: 'visibility' }
                }
                tintColor={colors.textDim}
                size={19}
                weight="regular"
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
});

/** The mint ring is our focus indicator, so drop the browser's own outline. */
const webInputReset = { outlineWidth: 0 } as TextStyle;

const styles = StyleSheet.create({
  block: {
    width: '100%',
    gap: space.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  label: {
    flexShrink: 0,
    color: colors.textDim,
    fontFamily: font.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  error: {
    flexShrink: 1,
    marginLeft: space.sm,
    color: colors.danger,
    fontFamily: font.body,
    fontSize: 11.5,
    textAlign: 'right',
  },
  ring: {
    borderRadius: radius.field,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
  },
  ringFocus: {
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: radius.field,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
  ringError: {
    borderColor: 'rgba(240, 132, 108, 0.7)',
  },
  inner: {
    height: 56,
    borderRadius: radius.field - 1,
    borderCurve: 'continuous',
    backgroundColor: colors.glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    overflow: 'hidden',
  },
  innerFocused: {
    backgroundColor: colors.glassRaised,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: font.body,
    fontSize: 16,
    padding: 0,
    height: '100%',
  },
  eye: {
    width: 26,
    alignItems: 'flex-end',
  },
  eyePressed: {
    opacity: 0.5,
  },
});
