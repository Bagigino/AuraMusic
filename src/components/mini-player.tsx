import { usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { shouldShowMiniPlayer } from '@/audio/playback-queue';
import {
  getTabBarHeight,
  MINI_PLAYER_GAP,
  MINI_PLAYER_HEIGHT,
} from '@/components/player-layout-metrics';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { formatDuration } from '@/utils/format-duration';

export function MiniPlayer() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const {
    currentItem,
    source,
    isPlaying,
    position,
    duration,
    isResolving,
    canGoPrevious,
    canGoNext,
    togglePlayback,
    playPrevious,
    playNext,
  } = useAppAudioPlayer();
  const isFullPlayerRoute = pathname === '/player';

  if (!shouldShowMiniPlayer(currentItem, isFullPlayerRoute) || !currentItem) {
    return null;
  }

  const playDisabled = isResolving || !source;

  return (
    <View
      accessibilityLabel="Mini Player"
      style={[
        styles.container,
        { bottom: getTabBarHeight(insets.bottom) + MINI_PLAYER_GAP },
      ]}>
      <Pressable
        accessibilityHint="Apre il Player completo"
        accessibilityRole="button"
        onPress={() => router.push('/player')}
        style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}>
        <TrackArtwork size={52} thumbnail={currentItem.thumbnail ?? ''} />
        <View style={styles.trackInfo}>
          <Text numberOfLines={1} style={styles.title}>
            {currentItem.title}
          </Text>
          <Text numberOfLines={1} style={styles.time}>
            {formatDuration(position)} / {formatDuration(duration)}
          </Text>
        </View>
      </Pressable>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Precedente o riavvia"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoPrevious || isResolving }}
          disabled={!canGoPrevious || isResolving}
          hitSlop={6}
          onPress={() => void playPrevious()}
          style={({ pressed }) => [
            styles.control,
            (!canGoPrevious || isResolving) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.secondaryControlText}>⏮</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={isPlaying ? 'Pausa' : 'Riproduci'}
          accessibilityRole="button"
          accessibilityState={{ disabled: playDisabled }}
          disabled={playDisabled}
          hitSlop={5}
          onPress={() => void togglePlayback()}
          style={({ pressed }) => [
            styles.playControl,
            playDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {isResolving ? (
            <ActivityIndicator color={AuraColors.background} size="small" />
          ) : (
            <Text style={styles.playControlText}>{isPlaying ? 'Ⅱ' : '▶'}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityLabel="Successivo"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoNext || isResolving }}
          disabled={!canGoNext || isResolving}
          hitSlop={6}
          onPress={() => void playNext()}
          style={({ pressed }) => [
            styles.control,
            (!canGoNext || isResolving) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.secondaryControlText}>⏭</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 30,
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: '#1B1F2CF5',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 14,
  },
  trackButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackInfo: { flex: 1, minWidth: 0 },
  title: { color: AuraColors.text, fontSize: 13, fontWeight: '800' },
  time: { color: AuraColors.textMuted, fontSize: 11, marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  control: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryControlText: { color: AuraColors.text, fontSize: 17, fontWeight: '800' },
  playControl: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: AuraColors.primary,
  },
  playControlText: { color: AuraColors.background, fontSize: 18, fontWeight: '900' },
  disabled: { opacity: 0.34 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});
