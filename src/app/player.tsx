import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { PlaylistPicker } from '@/components/playlist-picker';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import { useTrackLibrary } from '@/library/track-library-context';
import type { TrackAvailability } from '@/models/player-source';
import type { DownloadProgress } from '@/services/download-service';
import { formatDuration } from '@/utils/format-duration';
import { getUserFacingError } from '@/utils/get-user-facing-error';

function progressLabel(progress: DownloadProgress | null) {
  if (!progress || progress.progress === null) {
    return 'Downloading…';
  }
  return `Downloading ${Math.round(progress.progress * 100)}%`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const {
    currentItem,
    source,
    status,
    isResolving,
    playbackError,
    togglePlayback,
    seekBy,
    seekTo,
  } = useAppAudioPlayer();
  const { tracks, saveTrackToPlaylists } = useTrackLibrary();
  const { getTrackPlaylistIds, setTrackPlaylists, refreshPlaylists } = usePlaylists();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [membershipCount, setMembershipCount] = useState(0);
  const [timelineWidth, setTimelineWidth] = useState(0);

  const libraryTrack = currentItem
    ? tracks.find((track) => track.id === currentItem.id && !track.missingLocalFile) ?? null
    : null;
  const availability: TrackAvailability = isSaving
    ? 'downloading'
    : libraryTrack
      ? 'local'
      : 'remote';

  useEffect(() => {
    if (!currentItem) {
      return;
    }
    let active = true;
    getTrackPlaylistIds(currentItem.id)
      .then((ids) => {
        if (active) {
          setMembershipCount(ids.length);
        }
      })
      .catch(() => {
        if (active) {
          setMembershipCount(0);
        }
      });
    return () => {
      active = false;
    };
  }, [currentItem, getTrackPlaylistIds, tracks]);

  if (!currentItem) {
    return (
      <AuraScreen title="Player" subtitle="Il brano in riproduzione apparirà qui.">
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>▶</Text>
          <Text style={styles.emptyTitle}>Nessun brano selezionato</Text>
          <Text style={styles.emptyText}>
            Tocca un risultato Search oppure un brano della Library per iniziare l’ascolto.
          </Text>
          <AuraButton label="Apri Search" onPress={() => router.push('/search')} />
        </View>
      </AuraScreen>
    );
  }

  const duration = status.duration || currentItem.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const buffering = isResolving || (!!source && !status.isLoaded) || status.isBuffering;
  const visiblePlaybackError = isResolving
    ? null
    : playbackError ?? (status.error ? 'La riproduzione audio non è riuscita.' : null);

  const handlePickerConfirm = async (playlistIds: string[]) => {
    setIsSaving(true);
    setDownloadProgress(null);
    setSaveError(null);
    try {
      if (libraryTrack) {
        await setTrackPlaylists(libraryTrack.id, playlistIds);
      } else {
        await saveTrackToPlaylists(
          currentItem.id,
          currentItem.sourceUrl,
          playlistIds,
          setDownloadProgress,
        );
        await refreshPlaylists();
      }
      setMembershipCount(playlistIds.length);
      setPickerVisible(false);
    } catch (error) {
      setSaveError(getUserFacingError(error));
      throw error;
    } finally {
      setIsSaving(false);
      setDownloadProgress(null);
    }
  };

  const handleTimelinePress = (locationX: number) => {
    if (timelineWidth <= 0 || duration <= 0 || !status.isLoaded) {
      return;
    }
    void seekTo((Math.min(timelineWidth, Math.max(0, locationX)) / timelineWidth) * duration);
  };

  const handleTimelineLayout = (event: LayoutChangeEvent) => {
    setTimelineWidth(event.nativeEvent.layout.width);
  };

  return (
    <AuraScreen
      title="Player"
      subtitle={
        source?.type === 'local'
          ? 'Riproduzione offline dal dispositivo.'
          : 'Streaming remoto. Il brano non viene salvato finché non premi +.'
      }>
      <View style={styles.player}>
        <View style={styles.artworkShadow}>
          <TrackArtwork size={260} thumbnail={currentItem.thumbnail ?? ''} />
          {buffering && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={AuraColors.text} size="large" />
            </View>
          )}
        </View>

        <View style={styles.trackInfo}>
          <Text numberOfLines={2} style={styles.title}>
            {currentItem.title}
          </Text>
          <Text style={styles.artist}>{currentItem.artist ?? 'Uploader non disponibile'}</Text>
        </View>

        <View style={[styles.availabilityPill, availability === 'remote' && styles.remotePill]}>
          <Text
            style={[
              styles.availabilityText,
              availability === 'remote' && styles.remoteText,
            ]}>
            {availability === 'downloading'
              ? progressLabel(downloadProgress)
              : availability === 'local'
                ? source?.type === 'remote'
                  ? '● SALVATO OFFLINE · STREAMING CORRENTE'
                  : '● RIPRODUZIONE LOCALE'
                : '● STREAMING'}
          </Text>
        </View>

        <View style={styles.timeline}>
          <Pressable
            accessibilityHint="Tocca per cambiare posizione"
            accessibilityLabel="Posizione nel brano"
            accessibilityRole="adjustable"
            disabled={!status.isLoaded || duration <= 0}
            onLayout={handleTimelineLayout}
            onPress={(event) => handleTimelinePress(event.nativeEvent.locationX)}
            style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatDuration(status.currentTime)}</Text>
            <Text style={styles.time}>{formatDuration(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityLabel="Indietro di 15 secondi"
            accessibilityRole="button"
            disabled={!status.isLoaded}
            onPress={() => void seekBy(-15)}
            style={({ pressed }) => [styles.seekButton, pressed && styles.pressed]}>
            <Text style={styles.seekText}>−15</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={status.playing ? 'Pausa' : 'Riproduci'}
            accessibilityRole="button"
            disabled={buffering || !source}
            onPress={() => void togglePlayback()}
            style={({ pressed }) => [
              styles.mainControl,
              (buffering || !source) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.mainControlText}>{status.playing ? 'Ⅱ' : '▶'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Avanti di 15 secondi"
            accessibilityRole="button"
            disabled={!status.isLoaded}
            onPress={() => void seekBy(15)}
            style={({ pressed }) => [styles.seekButton, pressed && styles.pressed]}>
            <Text style={styles.seekText}>+15</Text>
          </Pressable>
        </View>

        <View style={styles.bottomActions}>
          <Pressable
            accessibilityLabel="Gestisci playlist"
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Text style={styles.addSymbol}>{membershipCount > 0 ? '✓' : '+'}</Text>
          </Pressable>
          <View style={styles.addStatus}>
            <Text style={styles.addTitle}>
              {membershipCount > 0 ? 'Nelle tue playlist' : 'Add to playlist'}
            </Text>
            <Text style={styles.addSubtitle}>
              {isSaving
                ? progressLabel(downloadProgress)
                : libraryTrack
                  ? 'Gestisci le raccolte senza riscaricare'
                  : 'Scegli una playlist per salvarlo offline'}
            </Text>
          </View>
        </View>

        {visiblePlaybackError && <Text style={styles.error}>{visiblePlaybackError}</Text>}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </View>

      <PlaylistPicker
        busy={isSaving}
        onClose={() => setPickerVisible(false)}
        onConfirm={handlePickerConfirm}
        progressLabel={isSaving ? progressLabel(downloadProgress) : null}
        trackId={currentItem.id}
        visible={pickerVisible}
      />
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  player: { alignItems: 'center' },
  artworkShadow: {
    borderRadius: 64,
    shadowColor: AuraColors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 64,
    backgroundColor: 'rgba(9,10,15,0.62)',
  },
  trackInfo: { alignItems: 'center', marginTop: 32, paddingHorizontal: 12 },
  title: { color: AuraColors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  artist: { color: AuraColors.textMuted, fontSize: 16, marginTop: 7 },
  availabilityPill: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#153328',
  },
  remotePill: { backgroundColor: '#2B2144' },
  availabilityText: { color: AuraColors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  remoteText: { color: AuraColors.primary },
  timeline: { width: '100%', marginTop: 34 },
  progressTrack: {
    width: '100%',
    height: 12,
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: AuraColors.surfaceRaised,
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: AuraColors.primary },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  time: { color: AuraColors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26, marginTop: 27 },
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
  seekText: { color: AuraColors.text, fontSize: 13, fontWeight: '800' },
  mainControl: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 38,
    backgroundColor: AuraColors.primary,
  },
  mainControlText: { color: AuraColors.background, fontSize: 28, fontWeight: '900', marginLeft: 2 },
  bottomActions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 34,
  },
  addButton: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: AuraColors.primary,
  },
  addSymbol: { color: AuraColors.background, fontSize: 30, fontWeight: '800', lineHeight: 32 },
  addStatus: { flex: 1 },
  addTitle: { color: AuraColors.text, fontSize: 14, fontWeight: '800' },
  addSubtitle: { color: AuraColors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
  error: { color: AuraColors.danger, fontSize: 13, textAlign: 'center', marginTop: 18 },
  emptyCard: {
    alignItems: 'center',
    gap: 14,
    padding: 28,
    borderRadius: 26,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  emptyIcon: { color: AuraColors.primary, fontSize: 36, marginBottom: 4 },
  emptyTitle: { color: AuraColors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: AuraColors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
});
