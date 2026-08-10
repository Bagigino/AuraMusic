import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { formatDuration } from '@/utils/format-duration';

export default function PlayerScreen() {
  const router = useRouter();
  const { currentTrack, status, togglePlayback, seekBy } = useAppAudioPlayer();

  if (!currentTrack) {
    return (
      <AuraScreen title="Player" subtitle="Il brano in riproduzione apparirà qui.">
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>▶</Text>
          <Text style={styles.emptyTitle}>Nessun brano selezionato</Text>
          <Text style={styles.emptyText}>
            Apri la libreria e tocca un brano per iniziare l’ascolto.
          </Text>
          <AuraButton label="Apri Library" onPress={() => router.push('/')} />
        </View>
      </AuraScreen>
    );
  }

  const duration = status.duration || currentTrack.duration;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <AuraScreen title="Player" subtitle="Riproduzione dal file salvato sul dispositivo.">
      <View style={styles.player}>
        <View style={styles.artworkShadow}>
          <TrackArtwork size={260} />
        </View>

        <View style={styles.trackInfo}>
          <Text numberOfLines={2} style={styles.title}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist}>{currentTrack.artist}</Text>
        </View>

        <View style={styles.offlinePill}>
          <Text style={styles.offlineText}>● RIPRODUZIONE LOCALE</Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatDuration(status.currentTime)}</Text>
            <Text style={styles.time}>{formatDuration(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityLabel="Indietro di 15 secondi"
            accessibilityRole="button"
            onPress={() => void seekBy(-15)}
            style={({ pressed }) => [styles.seekButton, pressed && styles.pressed]}>
            <Text style={styles.seekText}>−15</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={status.playing ? 'Pausa' : 'Riproduci'}
            accessibilityRole="button"
            onPress={() => void togglePlayback()}
            style={({ pressed }) => [styles.mainControl, pressed && styles.pressed]}>
            <Text style={styles.mainControlText}>{status.playing ? 'Ⅱ' : '▶'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Avanti di 15 secondi"
            accessibilityRole="button"
            onPress={() => void seekBy(15)}
            style={({ pressed }) => [styles.seekButton, pressed && styles.pressed]}>
            <Text style={styles.seekText}>+15</Text>
          </Pressable>
        </View>

        {status.error && <Text style={styles.error}>{status.error}</Text>}
      </View>
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  player: {
    alignItems: 'center',
  },
  artworkShadow: {
    borderRadius: 64,
    shadowColor: AuraColors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 32,
    paddingHorizontal: 12,
  },
  title: {
    color: AuraColors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  artist: {
    color: AuraColors.textMuted,
    fontSize: 16,
    marginTop: 7,
  },
  offlinePill: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#153328',
  },
  offlineText: {
    color: AuraColors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  timeline: {
    width: '100%',
    marginTop: 34,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: AuraColors.surfaceRaised,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: AuraColors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  time: {
    color: AuraColors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
    marginTop: 27,
  },
  seekButton: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: AuraColors.surfaceRaised,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  seekText: {
    color: AuraColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  mainControl: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 38,
    backgroundColor: AuraColors.primary,
  },
  mainControlText: {
    color: AuraColors.background,
    fontSize: 28,
    fontWeight: '900',
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 18,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 14,
    padding: 28,
    borderRadius: 26,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  emptyIcon: {
    color: AuraColors.primary,
    fontSize: 36,
    marginBottom: 4,
  },
  emptyTitle: {
    color: AuraColors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: AuraColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
});
