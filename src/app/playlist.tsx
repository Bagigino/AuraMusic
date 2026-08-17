import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import type { Playlist } from '@/models/playlist';
import type { Track } from '@/models/track';
import { formatDuration } from '@/utils/format-duration';
import { getUserFacingError } from '@/utils/get-user-facing-error';

export default function PlaylistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { playlists, loadPlaylist } = usePlaylists();
  const { playTrack } = useAppAudioPlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playlistId) {
      return;
    }
    let active = true;
    loadPlaylist(playlistId)
      .then((result) => {
        if (active) {
          setPlaylist(result.playlist);
          setTracks(result.tracks);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getUserFacingError(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadPlaylist, playlistId, playlists]);

  const openTrack = async (track: Track) => {
    if (track.missingLocalFile) {
      return;
    }
    await playTrack(track);
    router.push('/player');
  };

  return (
    <AuraScreen
      title={playlist?.name ?? 'Playlist'}
      subtitle={playlist ? `${tracks.length} brani offline` : 'Raccolta locale'}>
      <AuraButton label="← Library" onPress={() => router.push('/')} variant="secondary" />

      {loading ? (
        <ActivityIndicator color={AuraColors.primary} style={styles.loading} />
      ) : error || !playlistId ? (
        <Text style={styles.error}>{error ?? 'Playlist non valida.'}</Text>
      ) : tracks.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Playlist vuota</Text>
          <Text style={styles.emptyText}>Apri un brano nel Player e usa + per aggiungerlo.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {tracks.map((track) => (
            <Pressable
              accessibilityRole="button"
              disabled={track.missingLocalFile}
              key={track.id}
              onPress={() => void openTrack(track)}
              style={({ pressed }) => [
                styles.trackCard,
                track.missingLocalFile && styles.unavailable,
                pressed && styles.pressed,
              ]}>
              <TrackArtwork size={64} thumbnail={track.thumbnail} />
              <View style={styles.trackInfo}>
                <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                <Text numberOfLines={1} style={styles.trackArtist}>{track.artist}</Text>
                <Text style={styles.duration}>
                  {track.missingLocalFile ? 'File locale mancante' : formatDuration(track.duration)}
                </Text>
              </View>
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          ))}
        </View>
      )}
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  list: { gap: 12, marginTop: 18 },
  trackCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 20, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { color: AuraColors.text, fontSize: 15, fontWeight: '800' },
  trackArtist: { color: AuraColors.textMuted, fontSize: 13, marginTop: 3 },
  duration: { color: AuraColors.textMuted, fontSize: 11, marginTop: 7 },
  playIcon: { color: AuraColors.primary, fontSize: 18 },
  unavailable: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  emptyCard: { alignItems: 'center', gap: 9, padding: 25, marginTop: 18, borderRadius: 22, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  emptyTitle: { color: AuraColors.text, fontSize: 19, fontWeight: '800' },
  emptyText: { color: AuraColors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 20 },
});
