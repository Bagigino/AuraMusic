import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import { getUserFacingError } from '@/utils/get-user-facing-error';

type PlaylistPickerProps = {
  visible: boolean;
  trackId: string;
  busy?: boolean;
  progressLabel?: string | null;
  onClose: () => void;
  onConfirm: (playlistIds: string[]) => Promise<void>;
};

export function PlaylistPicker({
  visible,
  trackId,
  busy = false,
  progressLabel,
  onClose,
  onConfirm,
}: PlaylistPickerProps) {
  const { playlists, createPlaylist, getTrackPlaylistIds } = usePlaylists();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let active = true;
    getTrackPlaylistIds(trackId)
      .then((ids) => {
        if (active) {
          setSelectedIds(ids);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getUserFacingError(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [getTrackPlaylistIds, trackId, visible]);

  const togglePlaylist = (playlistId: string) => {
    setSelectedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId],
    );
  };

  const handleCreate = async () => {
    try {
      const playlist = await createPlaylist(newName);
      setSelectedIds((current) => [...new Set([...current, playlist.id])]);
      setNewName('');
      setIsCreating(false);
      setError(null);
    } catch (createError) {
      setError(getUserFacingError(createError));
    }
  };

  const handleConfirm = async () => {
    try {
      setError(null);
      await onConfirm(selectedIds);
    } catch (confirmError) {
      setError(getUserFacingError(confirmError));
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={busy ? undefined : onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>AURAMUSIC</Text>
            <Text style={styles.title}>Add to playlist</Text>
          </View>
          <Pressable
            accessibilityLabel="Chiudi playlist picker"
            disabled={busy}
            onPress={onClose}
            style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <ActivityIndicator color={AuraColors.primary} />
          ) : playlists.length === 0 ? (
            <Text style={styles.emptyText}>Non hai ancora creato playlist.</Text>
          ) : (
            playlists.map((playlist) => {
              const selected = selectedIds.includes(playlist.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: busy }}
                  disabled={busy}
                  key={playlist.id}
                  onPress={() => togglePlaylist(playlist.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.playlistName}>{playlist.name}</Text>
                    <Text style={styles.trackCount}>
                      {playlist.trackCount === 1 ? '1 brano' : `${playlist.trackCount} brani`}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          {isCreating ? (
            <View style={styles.createCard}>
              <TextInput
                autoFocus
                editable={!busy}
                maxLength={60}
                onChangeText={setNewName}
                onSubmitEditing={() => void handleCreate()}
                placeholder="Nome playlist"
                placeholderTextColor={AuraColors.textMuted}
                returnKeyType="done"
                style={styles.input}
                value={newName}
              />
              <View style={styles.createActions}>
                <AuraButton
                  disabled={busy || !newName.trim()}
                  label="Create"
                  onPress={() => void handleCreate()}
                />
                <AuraButton
                  disabled={busy}
                  label="Cancel"
                  onPress={() => setIsCreating(false)}
                  variant="secondary"
                />
              </View>
            </View>
          ) : (
            <Pressable
              disabled={busy}
              onPress={() => setIsCreating(true)}
              style={({ pressed }) => [styles.newPlaylist, pressed && styles.pressed]}>
              <Text style={styles.newPlaylistText}>+ New playlist</Text>
            </Pressable>
          )}

          {progressLabel && (
            <View style={styles.progressRow}>
              <ActivityIndicator color={AuraColors.primary} size="small" />
              <Text style={styles.progressText}>{progressLabel}</Text>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <AuraButton
            disabled={isLoading || busy}
            label="Confirm"
            loading={busy}
            onPress={() => void handleConfirm()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AuraColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomColor: AuraColors.border,
    borderBottomWidth: 1,
  },
  eyebrow: { color: AuraColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: AuraColors.text, fontSize: 27, fontWeight: '900', marginTop: 5 },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: AuraColors.surfaceRaised,
  },
  closeText: { color: AuraColors.text, fontSize: 28, lineHeight: 30 },
  content: { gap: 12, padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 18,
    borderColor: AuraColors.border,
    borderWidth: 1,
    backgroundColor: AuraColors.surface,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderColor: AuraColors.textMuted,
    borderWidth: 1,
  },
  checkboxSelected: { backgroundColor: AuraColors.primary, borderColor: AuraColors.primary },
  checkmark: { color: AuraColors.background, fontSize: 16, fontWeight: '900' },
  rowText: { flex: 1 },
  playlistName: { color: AuraColors.text, fontSize: 16, fontWeight: '800' },
  trackCount: { color: AuraColors.textMuted, fontSize: 12, marginTop: 3 },
  emptyText: { color: AuraColors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  newPlaylist: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderColor: AuraColors.primary,
    borderWidth: 1,
  },
  newPlaylistText: { color: AuraColors.primary, fontSize: 14, fontWeight: '900' },
  createCard: {
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: AuraColors.background,
    borderColor: AuraColors.border,
    borderWidth: 1,
    color: AuraColors.text,
  },
  createActions: { gap: 9 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 8 },
  progressText: { color: AuraColors.textMuted, fontSize: 13 },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: { padding: 24, borderTopColor: AuraColors.border, borderTopWidth: 1 },
  pressed: { opacity: 0.7 },
});
