import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import { useTrackLibrary } from '@/library/track-library-context';
import { getUserFacingError } from '@/utils/get-user-facing-error';

export default function LibraryScreen() {
  const router = useRouter();
  const { tracks, isLoading, error } = useTrackLibrary();
  const {
    playlists,
    isLoading: playlistsLoading,
    error: playlistsError,
    createPlaylist,
  } = usePlaylists();
  const [createVisible, setCreateVisible] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      <Pressable
        accessibilityHint="Apre tutti i brani salvati nella Library"
        accessibilityRole="button"
        onPress={() => router.push('./all-songs')}
        style={({ pressed }) => [styles.allSongsCard, pressed && styles.pressed]}>
        <View>
          <Text style={styles.collectionLabel}>LIBRARY</Text>
          <Text style={styles.sectionTitle}>Le mie canzoni</Text>
          <Text style={styles.sectionSubtitle}>
            {isLoading
              ? 'Caricamento…'
              : tracks.length === 1
                ? '1 brano'
                : `${tracks.length} brani`}
          </Text>
        </View>
        <View style={styles.allSongsIcon}>
          {isLoading ? (
            <ActivityIndicator color={AuraColors.primary} />
          ) : (
            <Text style={styles.allSongsIconText}>♫</Text>
          )}
        </View>
      </Pressable>

      {!isLoading && tracks.length === 0 && (
        <Text style={styles.libraryHint}>La Library è vuota. Puoi aggiungere musica da Search.</Text>
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
  allSongsCard: {
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
  collectionLabel: {
    color: AuraColors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  allSongsIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#33255D' },
  allSongsIconText: { color: AuraColors.primary, fontSize: 24 },
  sectionTitle: { color: AuraColors.text, fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: AuraColors.textMuted, fontSize: 13, marginTop: 4 },
  mutedText: { color: AuraColors.textMuted, fontSize: 14, lineHeight: 20 },
  libraryHint: { color: AuraColors.textMuted, fontSize: 13, lineHeight: 19, marginHorizontal: 4 },
  playlistsSection: { gap: 12, marginTop: 30 },
  playlistCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 20, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  playlistIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#2B2144' },
  playlistIconText: { color: AuraColors.primary, fontSize: 23 },
  playlistInfo: { flex: 1 },
  playlistName: { color: AuraColors.text, fontSize: 16, fontWeight: '800' },
  chevron: { color: AuraColors.primary, fontSize: 28 },
  newPlaylistButton: { alignItems: 'center', padding: 16, borderRadius: 18, borderColor: AuraColors.primary, borderWidth: 1 },
  newPlaylistText: { color: AuraColors.primary, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.72 },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' },
  modalCard: { gap: 13, padding: 22, borderRadius: 24, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  modalTitle: { color: AuraColors.text, fontSize: 23, fontWeight: '900' },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, backgroundColor: AuraColors.background, borderColor: AuraColors.border, borderWidth: 1, color: AuraColors.text },
});
