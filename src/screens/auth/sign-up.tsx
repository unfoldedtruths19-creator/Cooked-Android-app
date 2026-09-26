import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthButton, EMAIL_PATTERN, shake, tap } from './auth-button';
import { AuthShell } from './auth-shell';
import { GlassField } from './glass-field';
import { StrengthMeter } from './strength-meter';
import { colors, font, space } from '@/theme/tokens';
import { signUpWithEmail } from '@/lib/auth-email';

type Errors = Partial<Record<'email' | 'password' | 'confirm', string>>;

export function SignUpScreen() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice] = useState('');
  /** Clear a field's error as soon as the person starts fixing it. */
  function edit(key: keyof Errors, setValue: (next: string) => void) {
    return (next: string) => {
      setValue(next);
      setSubmitted(false);
      setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    };
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Not a valid address';
    if (password.length < 8) next.password = 'Use 8 or more';
    if (confirm !== password) next.confirm = 'Does not match';
    return next;
  }

  async function handleSubmit() {
    if (isLoading) return;
    const next = validate();
    setErrors(next);

    if (Object.keys(next).length > 0) {
      shake();
      setSubmitted(false);
      return;
    }

    tap(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    const { error } = await signUpWithEmail(email.trim(), password);

    setIsLoading(false);
    if (error) {
      shake();
      setSubmitted(false);
      setErrors({ email: error.message });
      return;
    }

    setSubmitted(true);
    router.push({ pathname: '/verify', params: { email: email.trim() } });
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set it up once, then put the phone down."
      footerText="Already have an account?"
      footerAction="Log in"
      onFooterPress={() => {
        tap(Haptics.ImpactFeedbackStyle.Light);
        router.push('/login');
      }}
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
          placeholder="At least 8 characters"
          secureTextEntry={!showPassword}
          isSecure={!showPassword}
          onToggleSecure={() => setShowPassword((value) => !value)}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          error={errors.password}
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <StrengthMeter password={password} />
      </View>

      <GlassField
        ref={confirmRef}
        label="Confirm password"
        icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
        value={confirm}
        onChangeText={edit('confirm', setConfirm)}
        placeholder="Repeat it"
        secureTextEntry={!showConfirm}
        isSecure={!showConfirm}
        onToggleSecure={() => setShowConfirm((value) => !value)}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        error={errors.confirm}
        onSubmitEditing={handleSubmit}
      />

      <AuthButton label="Create account" onPress={handleSubmit} isLoading={isLoading} />

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {submitted ? (
        <Text style={styles.confirmation}>
          Account created. Check your email if verification is required.
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  passwordGroup: {
    gap: space.sm,
  },
  confirmation: {
    color: colors.spring,
    fontFamily: font.body,
    fontSize: 13,
    textAlign: 'center',
  },
  notice: {
    color: colors.spring,
    fontFamily: font.body,
    fontSize: 13,
    textAlign: 'center',
  },
});
