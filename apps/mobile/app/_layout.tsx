import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadApiUrl } from '../src/api';
import { colors } from '../src/theme';

export default function RootLayout() {
  useEffect(() => {
    void loadApiUrl();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="notebook/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="output/[id]" options={{ title: 'Studio output' }} />
        <Stack.Screen
          name="capture"
          options={{ title: 'Add a source', presentation: 'modal' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
