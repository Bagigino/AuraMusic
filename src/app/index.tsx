import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import { useTrackLibrary } from '@/library/track-library-context';
import type { Track } from '@/models/track';
import { formatDuration } from '@/utils/format-duration';
import { getUserFacingError } from '@/utils/get-user-facing-error';

export default function LibraryScreen() {
  const router = useRouter();
  const { tracks, isLoading, error, removeTrack } = useTrackLibrary();
  const {
    playlists,
    isLoading: playlistsLoading,
    error: playlistsError,
    createPlaylist,
    refreshPlaylists,
  } = usePlaylists();
  const { playTrack } = useAppAudioPlayer();
  const [createVisible, setCreateVisible] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const handleCreatePlaylist = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await createPlaylist(playlistName);
      setPlaylistName('');
      setCreateVisible(false);
    } catch (createPlaylistError) {
      setCreateError(getUserFacingError(createPlaylistError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <AuraScreen title="La tua musica" subtitle="Brani offline e playlist salvati sul dispositivo.">
      <View style={styles.allSongsHeader}>
        <View>
          <Text style={styles.sectionTitle}>All Songs</Text>
          <Text style={styles.sectionSubtitle}>
            {tracks.length === 1 ? '1 track' : `${tracks.length} tracks`}
          </Text>
        </View>
        <View style={styles.allSongsIcon}>
          <Text style={styles.allSongsIconText}>♫</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={AuraColors.primary} />
          <Text style={styles.mutedText}>Carico la libreria…</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nessun brano offline</Text>
          <Text style={styles.emptyText}>
            Cerca un brano, ascoltalo nel Player e premi + per salvarlo in una playlist.
          </Text>
          <AuraButton label="Apri Search" onPress={() => router.push('/search')} />
        </View>
      ) : (
        <View style={styles.trackList}>
          {tracks.map((track) => (
            <View key={track.id} style={styles.trackCard}>
              <Pressable
                accessibilityHint={
                  track.missingLocalFile
                    ? 'Il file locale non è disponibile'
                    : 'Apre il Player e avvia il brano locale'
                }
                accessibilityRole="button"
                accessibilityState={{ disabled: track.missingLocalFile }}
                disabled={track.missingLocalFile}
                onPress={() => void openTrack(track)}
                style={({ pressed }) => [
                  styles.trackMain,
                  track.missingLocalFile && styles.unavailable,
                  pressed && styles.pressed,
                ]}>
                <TrackArtwork size={64} thumbnail={track.thumbnail} />
                <View style={styles.trackDetails}>
                  <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                  <Text numberOfLines={1} style={styles.trackArtist}>{track.artist}</Text>
                  <View style={styles.metadataRow}>
                    <Text style={track.missingLocalFile ? styles.missingBadge : styles.localBadge}>
                      {track.missingLocalFile ? 'FILE MANCANTE' : '● LOCALE'}
                    </Text>
                    <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
                  </View>
                </View>
                <Text style={styles.playIcon}>▶</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Elimina ${track.title}`}
                onPress={() => confirmRemoveTrack(track)}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                <Text style={styles.deleteText}>Elimina</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.playlistsSection}>
        <Text style={styles.sectionTitle}>Playlists</Text>
        {playlistsLoading ? (
          <ActivityIndicator color={AuraColors.primary} />
        ) : playlists.length === 0 ? (
          <Text style={styles.mutedText}>Nessuna playlist. Creane una quando vuoi.</Text>
        ) : (
          playlists.map((playlist) => (
            <Pressable
              accessibilityHint="Apre i brani offline della playlist"
              accessibilityRole="button"
              key={playlist.id}
              onPress={() => router.push({ pathname: './playlist', params: { id: playlist.id } })}
              style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}>
              <View style={styles.playlistIcon}><Text style={styles.playlistIconText}>♪</Text></View>
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistName}>{playlist.name}</Text>
                <Text style={styles.sectionSubtitle}>
                  {playlist.trackCount === 1 ? '1 track' : `${playlist.trackCount} tracks`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
        )}
        <Pressable
          onPress={() => {
            setCreateError(null);
            setCreateVisible(true);
          }}
          style={({ pressed }) => [styles.newPlaylistButton, pressed && styles.pressed]}>
          <Text style={styles.newPlaylistText}>+ New Playlist</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {playlistsError && <Text style={styles.error}>{playlistsError}</Text>}

      <Modal
        animationType="fade"
        onRequestClose={() => setCreateVisible(false)}
        transparent
        visible={createVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New playlist</Text>
            <TextInput
              autoFocus
              editable={!creating}
              maxLength={60}
              onChangeText={setPlaylistName}
              onSubmitEditing={() => void handleCreatePlaylist()}
              placeholder="Nome playlist"
              placeholderTextColor={AuraColors.textMuted}
              style={styles.input}
              value={playlistName}
            />
            {createError && <Text style={styles.error}>{createError}</Text>}
            <AuraButton
              disabled={!playlistName.trim() || creating}
              label="Create"
              loading={creating}
              onPress={() => void handleCreatePlaylist()}
            />
            <AuraButton
              disabled={creating}
              label="Cancel"
              onPress={() => setCreateVisible(false)}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  allSongsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
    marginBottom: 14,
  },
  allSongsIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#33255D' },
  allSongsIconText: { color: AuraColors.primary, fontSize: 24 },
  sectionTitle: { color: AuraColors.text, fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: AuraColors.textMuted, fontSize: 13, marginTop: 4 },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 160 },
  mutedText: { color: AuraColors.textMuted, fontSize: 14, lineHeight: 20 },
  emptyCard: { alignItems: 'center', gap: 14, padding: 24, borderRadius: 22, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  emptyTitle: { color: AuraColors.text, fontSize: 19, fontWeight: '800' },
  emptyText: { color: AuraColors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  trackList: { gap: 12 },
  trackCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  trackMain: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  trackDetails: { flex: 1, minWidth: 0 },
  trackTitle: { color: AuraColors.text, fontSize: 15, fontWeight: '800' },
  trackArtist: { color: AuraColors.textMuted, fontSize: 13, marginTop: 3 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  localBadge: { color: AuraColors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  missingBadge: { color: AuraColors.danger, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  duration: { color: AuraColors.textMuted, fontSize: 11 },
  playIcon: { color: AuraColors.primary, fontSize: 18 },
  deleteButton: { alignItems: 'center', paddingVertical: 9, borderTopColor: AuraColors.border, borderTopWidth: 1 },
  deleteText: { color: AuraColors.danger, fontSize: 12, fontWeight: '800' },
  playlistsSection: { gap: 12, marginTop: 30 },
  playlistCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 20, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  playlistIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#2B2144' },
  playlistIconText: { color: AuraColors.primary, fontSize: 23 },
  playlistInfo: { flex: 1 },
  playlistName: { color: AuraColors.text, fontSize: 16, fontWeight: '800' },
  chevron: { color: AuraColors.primary, fontSize: 28 },
  newPlaylistButton: { alignItems: 'center', padding: 16, borderRadius: 18, borderColor: AuraColors.primary, borderWidth: 1 },
  newPlaylistText: { color: AuraColors.primary, fontSize: 14, fontWeight: '900' },
  unavailable: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' },
  modalCard: { gap: 13, padding: 22, borderRadius: 24, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  modalTitle: { color: AuraColors.text, fontSize: 23, fontWeight: '900' },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, backgroundColor: AuraColors.background, borderColor: AuraColors.border, borderWidth: 1, color: AuraColors.text },
});
