import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackList } from '@/components/track-list';
import { AuraColors } from '@/constants/aura-theme';
import { selectAllSongs } from '@/library/all-songs';
import { usePlaylists } from '@/library/playlist-context';
import { useTrackLibrary } from '@/library/track-library-context';
import type { Track } from '@/models/track';

export default function AllSongsScreen() {
  const router = useRouter();
  const { tracks, isLoading, error, removeTrack } = useTrackLibrary();
  const { refreshPlaylists } = usePlaylists();
  const { playTrack } = useAppAudioPlayer();
  const allSongs = useMemo(() => selectAllSongs(tracks), [tracks]);

  const openTrack = async (track: Track) => {
    if (track.missingLocalFile) {
      return;
    }
    await playTrack(track);
    router.push('/player');
  };

  const confirmRemoveTrack = (track: Track) => {
    Alert.alert(
      'Elimina brano',
      `Rimuovere "${track.title}" dalla Library, da tutte le playlist e dal dispositivo?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void removeTrack(track).then(refreshPlaylists).catch(() => undefined);
          },
        },
      ],
    );
  };

  return (
    <AuraScreen
      title="Le mie canzoni"
      subtitle={allSongs.length === 1 ? '1 brano salvato' : `${allSongs.length} brani salvati`}>
      <AuraButton label="← Library" onPress={() => router.push('/')} variant="secondary" />

      {isLoading ? (
        <ActivityIndicator color={AuraColors.primary} style={styles.loading} />
      ) : allSongs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nessun brano salvato</Text>
          <Text style={styles.emptyText}>I brani scaricati compariranno qui.</Text>
          <AuraButton label="Apri Search" onPress={() => router.push('/search')} />
        </View>
      ) : (
        <TrackList
          actionLabel="Elimina"
          onTrackAction={confirmRemoveTrack}
          onTrackPress={(track) => void openTrack(track)}
          tracks={allSongs}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  emptyCard: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    marginTop: 18,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  emptyTitle: { color: AuraColors.text, fontSize: 19, fontWeight: '800' },
  emptyText: { color: AuraColors.textMuted, fontSize: 14 },
  error: { color: AuraColors.danger, fontSize: 13, textAlign: 'center', marginTop: 18 },
});
