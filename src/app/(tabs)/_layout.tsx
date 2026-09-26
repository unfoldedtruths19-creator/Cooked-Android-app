import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { blur, colors, font } from '@/theme/tokens';

function icon(name: SymbolViewProps['name']) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={22} weight="regular" />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mint,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarBackground: () => (
          <BlurView intensity={blur.bar} tint="dark" style={StyleSheet.absoluteFill} />
        ),
        tabBarStyle: {
          backgroundColor: colors.glassBar,
          borderTopColor: colors.glassLine,
          borderTopWidth: 1,
          height: 72 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
        },
        tabBarLabelStyle: {
          fontFamily: font.bodyMedium,
          fontSize: 11,
          lineHeight: 15,
          letterSpacing: 0.4,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: icon({ ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' }),
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: 'Focus',
          tabBarIcon: icon({ ios: 'timer', android: 'timer', web: 'timer' }),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: icon({ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: icon({ ios: 'person', android: 'person', web: 'person' }),
        }}
      />
    </Tabs>
  );
}
