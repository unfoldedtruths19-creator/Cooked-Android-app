import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from './auth-shell';
import { GlassField } from './glass-field';
import { AuthButton, shake, tap } from './auth-button';

export function SetupNameScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    if (isLoading) return;
    
    const trimmed = name.trim();
    if (!trimmed) {
      shake();
      setError('Please enter your name');
      return;
    }

    tap(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      data: { name: trimmed }
    });

    setIsLoading(false);

    if (updateError) {
      shake();
      setError(updateError.message);
      return;
    }

    // After updating the name, the auth state change listener or 
    // AuthProvider will pick up the update and route appropriately, 
    // but to be safe we trigger routeIntoApp via reloading session context.
    router.replace('/(tabs)/today');
  }

  return (
    <AuthShell
      title="What should we call you?"
      subtitle="Your focus journey starts here."
    >
      <GlassField
        label="First Name"
        icon={{ ios: 'person', android: 'person', web: 'person' }}
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(undefined);
        }}
        placeholder="Kruthik"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="go"
        error={error}
        onSubmitEditing={handleSubmit}
      />

      <AuthButton label="Continue" onPress={handleSubmit} isLoading={isLoading} />
    </AuthShell>
  );
}
