import type { Track } from '../models/track';

export type TrackFileInspector = (localUri: string) => boolean | Promise<boolean>;

export async function applyLocalFileAvailability(
  tracks: Track[],
  fileExists: TrackFileInspector,
): Promise<Track[]> {
  return Promise.all(
    tracks.map(async (track) => ({
      ...track,
      missingLocalFile: !(await fileExists(track.localUri)),
    })),
  );
}
