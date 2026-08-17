import type { Track } from '@/models/track';
import type { DownloadProgressCallback } from '@/services/download-service';

export type SaveTrackToPlaylistsDependencies = {
  findTrack(videoId: string): Promise<Track | null>;
  localFileExists(localUri: string): boolean;
  downloadAudio(sourceUrl: string, onProgress?: DownloadProgressCallback): Promise<Track>;
  persistTrackWithPlaylists(track: Track, playlistIds: readonly string[]): Promise<void>;
  setExistingTrackPlaylists(trackId: string, playlistIds: readonly string[]): Promise<void>;
  deleteAudio(track: Track): Promise<void>;
};

export type SaveTrackToPlaylistsResult = {
  track: Track;
  downloaded: boolean;
};

export async function saveTrackToPlaylists(
  dependencies: SaveTrackToPlaylistsDependencies,
  request: {
    videoId: string;
    sourceUrl: string;
    playlistIds: readonly string[];
    onProgress?: DownloadProgressCallback;
  },
): Promise<SaveTrackToPlaylistsResult> {
  const playlistIds = [...new Set(request.playlistIds)];
  const existingTrack = await dependencies.findTrack(request.videoId);
  if (existingTrack && dependencies.localFileExists(existingTrack.localUri)) {
    await dependencies.setExistingTrackPlaylists(existingTrack.id, playlistIds);
    return { track: existingTrack, downloaded: false };
  }

  if (playlistIds.length === 0) {
    throw new Error('Seleziona almeno una playlist prima di salvare il brano.');
  }

  const downloadedTrack = await dependencies.downloadAudio(
    request.sourceUrl,
    request.onProgress,
  );
  try {
    await dependencies.persistTrackWithPlaylists(downloadedTrack, playlistIds);
  } catch (error) {
    try {
      await dependencies.deleteAudio(downloadedTrack);
    } catch (cleanupError) {
      console.error('AuraMusic could not remove an orphaned downloaded file', cleanupError);
    }
    throw error;
  }
  return { track: downloadedTrack, downloaded: true };
}
