import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { useTrackLibrary } from '@/library/track-library-context';
import type { Track } from '@/models/track';
import { formatDuration } from '@/utils/format-duration';

export default function LibraryScreen() {
  const router = useRouter();
  const { tracks, isLoading, error } = useTrackLibrary();
  const { playTrack } = useAppAudioPlayer();

  const openTrack = (track: Track) => {
    playTrack(track);
    router.push('./player');
  };

  return (
    <AuraScreen title="La tua musica" subtitle="Brani salvati sul dispositivo e pronti da ascoltare.">
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={AuraColors.primary} />
          <Text style={styles.mutedText}>Carico la libreria…</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>♫</Text>
          </View>
          <Text style={styles.emptyTitle}>La libreria è vuota</Text>
          <Text style={styles.emptyText}>
            Aggiungi il brano M4A incluso per provare subito la riproduzione offline.
          </Text>
          <AuraButton label="Vai ad Add Track" onPress={() => router.push('./add-track')} />
        </View>
      ) : (
        <View style={styles.trackList}>
          <Text style={styles.sectionLabel}>
            {tracks.length === 1 ? '1 BRANO' : `${tracks.length} BRANI`}
          </Text>
          {tracks.map((track) => (
            <Pressable
              accessibilityHint="Apre il player e avvia il brano locale"
              accessibilityRole="button"
              key={track.id}
              onPress={() => openTrack(track)}
              style={({ pressed }) => [styles.trackCard, pressed && styles.pressed]}>
              <TrackArtwork size={68} />
              <View style={styles.trackDetails}>
                <Text numberOfLines={1} style={styles.trackTitle}>
                  {track.title}
                </Text>
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {track.artist}
                </Text>
                <View style={styles.metadataRow}>
                  <Text style={styles.localBadge}>● LOCALE</Text>
                  <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
                </View>
              </View>
              <View style={styles.playButton}>
                <Text style={styles.playButtonText}>▶</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 260,
  },
  mutedText: {
    color: AuraColors.textMuted,
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 14,
    padding: 26,
    borderRadius: 26,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#33255D',
    marginBottom: 4,
  },
  emptyIconText: {
    color: AuraColors.primary,
    fontSize: 34,
  },
  emptyTitle: {
    color: AuraColors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  emptyText: {
    color: AuraColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  trackList: {
    gap: 12,
  },
  sectionLabel: {
    color: AuraColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  trackDetails: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    color: AuraColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  trackArtist: {
    color: AuraColors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  localBadge: {
    color: AuraColors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  duration: {
    color: AuraColors.textMuted,
    fontSize: 11,
  },
  playButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: AuraColors.primary,
  },
  playButtonText: {
    color: AuraColors.background,
    fontSize: 15,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.75,
  },
  error: {
    color: AuraColors.danger,
    fontSize: 14,
    marginTop: 18,
    textAlign: 'center',
  },
});
