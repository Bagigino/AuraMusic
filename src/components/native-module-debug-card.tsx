import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraColors } from '@/constants/aura-theme';
import {
  getNativeMessage,
  testPython,
  testYtDlpAppleProvider,
  testYtDlpImport,
} from '@/native/aura-native-test';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Errore sconosciuto durante il test nativo.';
}

export function NativeModuleDebugCard() {
  const [message, setMessage] = useState<string | null>(null);
  const [pythonMessage, setPythonMessage] = useState<string | null>(null);
  const [ytDlpMessage, setYtDlpMessage] = useState<string | null>(null);
  const [appleProviderMessage, setAppleProviderMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<
    'native' | 'python' | 'yt-dlp' | 'apple-provider' | null
  >(null);

  const handleTest = async () => {
    setActiveTest('native');
    setMessage(null);
    setError(null);

    try {
      setMessage(await getNativeMessage());
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handleAppleProviderTest = async () => {
    setActiveTest('apple-provider');
    setAppleProviderMessage(null);
    setError(null);

    try {
      const result = await testYtDlpAppleProvider();
      setAppleProviderMessage(
        typeof result === 'string'
          ? result
          : result.success
            ? `Apple WebKit provider ready: ${result.version}`
            : 'Apple WebKit provider unavailable',
      );
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handlePythonTest = async () => {
    setActiveTest('python');
    setPythonMessage(null);
    setError(null);

    try {
      const result = await testPython();
      setPythonMessage(typeof result === 'number' ? `Python result: ${result}` : result);
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handleYtDlpTest = async () => {
    setActiveTest('yt-dlp');
    setYtDlpMessage(null);
    setError(null);

    try {
      const result = await testYtDlpImport();
      setYtDlpMessage(
        typeof result === 'string' ? result : `yt-dlp imported: ${result.version}`,
      );
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>DEBUG · EXPO MODULES API</Text>
      <Text style={styles.title}>Bridge TypeScript → Swift</Text>
      <Text style={styles.description}>
        Verifica che il client in uso contenga il modulo locale AuraNativeTest.
      </Text>

      <AuraButton
        label="Test native module"
        disabled={activeTest !== null}
        loading={activeTest === 'native'}
        onPress={() => void handleTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test Python"
        disabled={activeTest !== null}
        loading={activeTest === 'python'}
        onPress={() => void handlePythonTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test yt-dlp"
        disabled={activeTest !== null}
        loading={activeTest === 'yt-dlp'}
        onPress={() => void handleYtDlpTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test Apple WebKit provider"
        disabled={activeTest !== null}
        loading={activeTest === 'apple-provider'}
        onPress={() => void handleAppleProviderTest()}
        variant="secondary"
      />

      {message && <Text style={styles.success}>{message}</Text>}
      {pythonMessage && <Text style={styles.success}>{pythonMessage}</Text>}
      {ytDlpMessage && <Text style={styles.success}>{ytDlpMessage}</Text>}
      {appleProviderMessage && <Text style={styles.success}>{appleProviderMessage}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    marginTop: 28,
    padding: 20,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  eyebrow: {
    color: AuraColors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: AuraColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: AuraColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  success: {
    color: AuraColors.success,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
