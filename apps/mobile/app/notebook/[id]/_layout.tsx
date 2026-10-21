import { Stack } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotebookProvider } from '../../../src/notebook-context';
import { colors, fontSize, spacing } from '../../../src/theme';

export default function NotebookLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <NotebookProvider notebookId={id}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: 'Notebooks',
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen
          name="index"
          options={({ navigation }) => ({
            title: 'Chat',
            headerRight: () => (
              <Pressable
                onPress={() => navigation.navigate('sources')}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonLabel}>Sources</Text>
              </Pressable>
            ),
          })}
        />
        <Stack.Screen name="sources" options={{ title: 'Sources' }} />
        <Stack.Screen name="studio" options={{ title: 'Studio' }} />
      </Stack>
    </NotebookProvider>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  headerButtonLabel: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
