import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraColors } from '@/constants/aura-theme';
import { getNativeMessage } from '@/native/aura-native-test';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Errore sconosciuto durante il test nativo.';
}

export function NativeModuleDebugCard() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTest = async () => {
    setIsLoading(true);
    setMessage(null);
    setError(null);

    try {
      setMessage(await getNativeMessage());
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setIsLoading(false);
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
        loading={isLoading}
        onPress={() => void handleTest()}
        variant="secondary"
      />

      {message && <Text style={styles.success}>{message}</Text>}
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
