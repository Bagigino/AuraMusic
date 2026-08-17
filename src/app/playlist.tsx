import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackList } from '@/components/track-list';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import type { Playlist } from '@/models/playlist';
import type { Track } from '@/models/track';
import { getUserFacingError } from '@/utils/get-user-facing-error';

export default function PlaylistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    playlists,
    loadPlaylist,
    getTrackPlaylistIds,
    setTrackPlaylists,
  } = usePlaylists();
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

  const confirmRemoveFromPlaylist = (track: Track) => {
    if (!playlistId) {
      return;
    }

    Alert.alert(
      'Rimuovi dalla playlist',
      `Rimuovere "${track.title}" solo da questa playlist? Il brano resterà nella Library.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const membershipIds = await getTrackPlaylistIds(track.id);
                await setTrackPlaylists(
                  track.id,
                  membershipIds.filter((id) => id !== playlistId),
                );
                setTracks((currentTracks) =>
                  currentTracks.filter((currentTrack) => currentTrack.id !== track.id),
                );
              } catch (removeError) {
                setError(getUserFacingError(removeError));
              }
            })();
          },
        },
      ],
    );
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
        <TrackList
          actionLabel="Rimuovi"
          onTrackAction={confirmRemoveFromPlaylist}
          onTrackPress={(track) => void openTrack(track)}
          tracks={tracks}
        />
      )}
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  emptyCard: { alignItems: 'center', gap: 9, padding: 25, marginTop: 18, borderRadius: 22, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  emptyTitle: { color: AuraColors.text, fontSize: 19, fontWeight: '800' },
  emptyText: { color: AuraColors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 20 },
});
