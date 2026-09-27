import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { colors } from '@/theme/tokens';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { handleAppLaunch } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, isLoading]);

  useEffect(() => {
    // Call on initial mount
    handleAppLaunch().catch(console.error);

    // Call when app comes to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        handleAppLaunch().catch(console.error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}
      >
        {/* Auth screens — prevent Back from returning here after login */}
        <Stack.Screen name="index" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="verify" options={{ animation: 'fade' }} />

        {/* Permission / sync / onboarding — no back into auth */}
        <Stack.Screen name="permission" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="permission-fallback" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="sync-loading" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />

        {/* Main app routes */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="focus-setup" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="roast" options={{ animation: 'fade' }} />
        <Stack.Screen name="circles" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  return (
    <AuthProvider>
      <AppContent fontsLoaded={loaded} />
    </AuthProvider>
  );
}
