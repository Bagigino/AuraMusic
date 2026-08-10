import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { AuraColors } from '@/constants/aura-theme';

type AuraButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

export function AuraButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: AuraButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={AuraColors.background} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 22,
    backgroundColor: AuraColors.primary,
  },
  secondaryButton: {
    backgroundColor: AuraColors.surfaceRaised,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  label: {
    color: AuraColors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryLabel: {
    color: AuraColors.text,
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
