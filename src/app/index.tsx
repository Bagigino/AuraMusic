import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const { tracks, isLoading, error, removeTrack } = useTrackLibrary();
  const { playTrack } = useAppAudioPlayer();

  const openTrack = (track: Track) => {
    if (track.missingLocalFile) {
      return;
    }
    playTrack(track);
    router.push('./player');
  };

  const confirmRemoveTrack = (track: Track) => {
    Alert.alert(
      'Elimina brano',
      `Rimuovere "${track.title}" dalla Library e dal dispositivo?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => void removeTrack(track),
        },
      ],
    );
  };

  return (
    <AuraScreen title="La tua musica" subtitle="Brani salvati sul dispositivo e pronti da ascoltare.">
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={AuraColors.primary} />
          <Text style={styles.mutedText}>Carico la libreria...</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>♪</Text>
          </View>
          <Text style={styles.emptyTitle}>La libreria e vuota</Text>
          <Text style={styles.emptyText}>
            Apri Add Track per analizzare un URL YouTube e salvare un M4A offline.
          </Text>
          <AuraButton label="Vai ad Add Track" onPress={() => router.push('./add-track')} />
        </View>
      ) : (
        <View style={styles.trackList}>
          <Text style={styles.sectionLabel}>
            {tracks.length === 1 ? '1 BRANO' : `${tracks.length} BRANI`}
          </Text>
          {tracks.map((track) => (
            <View key={track.id} style={styles.trackCard}>
              <Pressable
                accessibilityHint={
                  track.missingLocalFile
                    ? 'Il file locale non e disponibile'
                    : 'Apre il player e avvia il brano locale'
                }
                accessibilityRole="button"
                accessibilityState={{ disabled: track.missingLocalFile }}
                disabled={track.missingLocalFile}
                onPress={() => openTrack(track)}
                style={({ pressed }) => [
                  styles.trackMain,
                  track.missingLocalFile && styles.unavailable,
                  pressed && styles.pressed,
                ]}>
                <TrackArtwork size={68} thumbnail={track.thumbnail} />
                <View style={styles.trackDetails}>
                  <Text numberOfLines={1} style={styles.trackTitle}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.trackArtist}>
                    {track.artist}
                  </Text>
                  <View style={styles.metadataRow}>
                    <Text
                      style={track.missingLocalFile ? styles.missingBadge : styles.localBadge}>
                      {track.missingLocalFile ? 'FILE MANCANTE' : '● LOCALE'}
                    </Text>
                    <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
                  </View>
                </View>
                <View style={styles.playButton}>
                  <Text style={styles.playButtonText}>▶</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`Elimina ${track.title}`}
                accessibilityRole="button"
                onPress={() => confirmRemoveTrack(track)}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                <Text style={styles.deleteText}>Elimina</Text>
              </Pressable>
            </View>
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
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  trackMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
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
  missingBadge: {
    color: AuraColors.danger,
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
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopColor: AuraColors.border,
    borderTopWidth: 1,
    backgroundColor: AuraColors.background,
  },
  deleteText: {
    color: AuraColors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  unavailable: {
    opacity: 0.48,
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
