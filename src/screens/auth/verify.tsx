import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton, tap } from './auth-button';
import { AuthShell } from './auth-shell';
import { colors, font, space } from '@/theme/tokens';
import { resendSignupConfirmation } from '@/lib/auth-email';

const RESEND_SECONDS = 30;

export function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function resend() {
    if (secondsLeft > 0 || !email) return;
    tap(Haptics.ImpactFeedbackStyle.Light);

    setError('');
    setNotice('');

    const { error: resendError } = await resendSignupConfirmation(email);

    if (resendError) {
      if (resendError.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
      } else {
        setError(resendError.message);
      }
      return;
    }

    setSecondsLeft(RESEND_SECONDS);
    setNotice('Confirmation email resent.');
  }

  function handleOpenLogin() {
    tap(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/login');
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle={`We sent a confirmation link to ${email || 'your email'}. Tap the link in the email to verify your account.`}
      footerText="Wrong address?"
      footerAction="Go back"
      onFooterPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    >
      <View style={styles.messageContainer}>
        <Text style={styles.instruction}>
          Open the link in your email to confirm your account, then come back here to log in.
        </Text>
      </View>

      <View style={styles.status}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>

      <AuthButton label="Go to login" onPress={handleOpenLogin} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resend confirmation email"
        accessibilityState={{ disabled: secondsLeft > 0 }}
        disabled={secondsLeft > 0}
        hitSlop={10}
        onPress={resend}
        style={({ pressed }) => [styles.resend, pressed && styles.pressed]}
      >
        <Text style={[styles.resendText, secondsLeft > 0 && styles.resendWaiting]}>
          {secondsLeft > 0
            ? `Resend email in ${secondsLeft}s`
            : 'Resend confirmation email'}
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    paddingVertical: space.sm,
  },
  instruction: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  status: {
    minHeight: 16,
    alignItems: 'center',
  },
  error: {
    color: colors.danger,
    fontFamily: font.body,
    fontSize: 13,
  },
  notice: {
    color: colors.spring,
    fontFamily: font.body,
    fontSize: 13,
  },
  resend: {
    alignSelf: 'center',
    paddingVertical: space.xs,
  },
  resendText: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 13.5,
  },
  resendWaiting: {
    color: colors.muted,
    fontFamily: font.body,
  },
  pressed: {
    opacity: 0.6,
  },
});
