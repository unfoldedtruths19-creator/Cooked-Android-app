import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthButton, EMAIL_PATTERN, shake, tap } from './auth-button';
import { AuthShell } from './auth-shell';
import { GlassField } from './glass-field';
import { colors, font, space } from '@/theme/tokens';
import { signInWithEmail } from '@/lib/auth-email';

type Errors = Partial<Record<'email' | 'password', string>>;

export function LoginScreen() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  function edit(key: keyof Errors, setValue: (next: string) => void) {
    return (next: string) => {
      setValue(next);
      setNotice('');
      setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    };
  }

  async function handleSubmit() {
    if (isLoading) return;
    const next: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Not a valid address';
    if (!password) next.password = 'Required';
    setErrors(next);

    if (Object.keys(next).length > 0) {
      shake();
      setNotice('');
      return;
    }

    tap(Haptics.ImpactFeedbackStyle.Medium);
    setNotice('');
    setIsLoading(true);

    try {
      const { error } = await signInWithEmail(email.trim(), password);

      if (error) {
        shake();
        setIsLoading(false);
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setNotice('Please confirm your email before logging in.');
        } else {
          setNotice(error.message);
        }
        return;
      }
      // AuthProvider.onAuthStateChange handles navigation after SIGNED_IN fires
      // isLoading stays true — screen will unmount on nav
    } catch (err: any) {
      shake();
      setIsLoading(false);
      setNotice(err?.message ?? 'Login failed. Please try again.');
    }
  }

  function goToSignUp() {
    tap(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in, then put the phone down."
      footerText="New to Cooked?"
      footerAction="Create an account"
      onFooterPress={goToSignUp}
    >
      <GlassField
        label="Email"
        icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
        value={email}
        onChangeText={edit('email', setEmail)}
        placeholder="you@domain.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        error={errors.email}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <View style={styles.passwordGroup}>
        <GlassField
          ref={passwordRef}
          label="Password"
          icon={{ ios: 'key', android: 'key', web: 'key' }}
          value={password}
          onChangeText={edit('password', setPassword)}
          placeholder="Your password"
          secureTextEntry={!showPassword}
          isSecure={!showPassword}
          onToggleSecure={() => setShowPassword((value) => !value)}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          error={errors.password}
          onSubmitEditing={handleSubmit}
        />
        <View style={styles.forgotRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            hitSlop={10}
            onPress={() => {
              tap(Haptics.ImpactFeedbackStyle.Light);
              setNotice('Password reset is not wired up yet.');
            }}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </View>
      </View>

      <AuthButton label="Log in" onPress={handleSubmit} isLoading={isLoading} />

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  passwordGroup: {
    gap: space.sm,
  },
  forgotRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  forgot: {
    color: colors.textDim,
    fontFamily: font.bodyMedium,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
  notice: {
    color: colors.spring,
    fontFamily: font.body,
    fontSize: 13,
    textAlign: 'center',
  },
});
