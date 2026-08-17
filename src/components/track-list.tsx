import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import type { Track } from '@/models/track';
import { formatDuration } from '@/utils/format-duration';

type TrackListProps = {
  tracks: readonly Track[];
  onTrackPress: (track: Track) => void;
  actionLabel?: string;
  onTrackAction?: (track: Track) => void;
};

export function TrackList({
  tracks,
  onTrackPress,
  actionLabel,
  onTrackAction,
}: TrackListProps) {
  return (
    <View style={styles.list}>
      {tracks.map((track) => (
        <View key={track.id} style={styles.card}>
          <Pressable
            accessibilityHint={
              track.missingLocalFile
                ? 'Il file locale non è disponibile'
                : 'Apre il Player e avvia il brano locale'
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: track.missingLocalFile }}
            disabled={track.missingLocalFile}
            onPress={() => onTrackPress(track)}
            style={({ pressed }) => [
              styles.main,
              track.missingLocalFile && styles.unavailable,
              pressed && styles.pressed,
            ]}>
            <TrackArtwork size={64} thumbnail={track.thumbnail} />
            <View style={styles.details}>
              <Text numberOfLines={1} style={styles.title}>{track.title}</Text>
              <Text numberOfLines={1} style={styles.artist}>{track.artist}</Text>
              <View style={styles.metadataRow}>
                <Text style={track.missingLocalFile ? styles.missingBadge : styles.localBadge}>
                  {track.missingLocalFile ? 'FILE MANCANTE' : '● LOCALE'}
                </Text>
                <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
              </View>
            </View>
            <Text style={styles.playIcon}>▶</Text>
          </Pressable>

          {actionLabel && onTrackAction && (
            <Pressable
              accessibilityLabel={`${actionLabel} ${track.title}`}
              onPress={() => onTrackAction(track)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.actionText}>{actionLabel}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 18 },
  card: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  details: { flex: 1, minWidth: 0 },
  title: { color: AuraColors.text, fontSize: 15, fontWeight: '800' },
  artist: { color: AuraColors.textMuted, fontSize: 13, marginTop: 3 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  localBadge: { color: AuraColors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  missingBadge: { color: AuraColors.danger, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  duration: { color: AuraColors.textMuted, fontSize: 11 },
  playIcon: { color: AuraColors.primary, fontSize: 18 },
  actionButton: {
    alignItems: 'center',
    paddingVertical: 9,
    borderTopColor: AuraColors.border,
    borderTopWidth: 1,
  },
  actionText: { color: AuraColors.danger, fontSize: 12, fontWeight: '800' },
  unavailable: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
