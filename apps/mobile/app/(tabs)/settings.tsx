import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiUrl, loadApiUrl, saveApiUrl } from '../../src/api';
import { Body, Button, Card, Field, Label } from '../../src/components/ui';
import { colors, fontSize, radius, spacing } from '../../src/theme';

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState(getApiUrl());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadApiUrl().then((url) => setApiUrl(url));
  }, []);

  async function save() {
    await saveApiUrl(apiUrl.trim());
    setSaved(true);
    Alert.alert(
      'Saved',
      'FreeLM will now talk to the server at this address. Restart the app if you are on a physical device and the address changed.',
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Card>
          <Label>Server address</Label>
          <Field
            value={apiUrl}
            onChangeText={(text) => {
              setApiUrl(text);
              setSaved(false);
            }}
            placeholder="http://192.168.1.10:3000"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Body muted>
            Use your computer’s LAN address so the app can reach the FreeLM
            server on the same network. On the Android emulator use
            http://10.0.2.2:3000.
          </Body>
          <Button
            label={saved ? 'Saved' : 'Save'}
            variant="primary"
            style={{ marginTop: spacing.md }}
            onPress={() => void save()}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Label>About</Label>
          <Text style={styles.title}>FreeLM</Text>
          <Body muted>
            An open-source, unrestricted clone of Google&apos;s Gemini Notebook
            (formerly NotebookLM). Every feature is available to every user —
            no premium tiers, no paywalls, no locked tools.
          </Body>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Label>Your data</Label>
          <Body muted>
            Notebooks, sources and outputs live on your own machine. FreeLM
            never trains on anything you upload.
          </Body>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footnote}>FreeLM · AGPL-3.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: 4,
  },
  footer: { marginTop: spacing.xl, padding: spacing.md },
  footnote: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
