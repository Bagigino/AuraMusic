import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuraColors } from '@/constants/aura-theme';

type AuraScreenProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function AuraScreen({ title, subtitle, children }: AuraScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.brand}>AURAMUSIC</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AuraColors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 28,
  },
  brand: {
    color: AuraColors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  title: {
    color: AuraColors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: AuraColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});
