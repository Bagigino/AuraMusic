import type { Track } from '@/models/track';

function downloadedAtTime(track: Track) {
  const timestamp = Date.parse(track.downloadedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Builds the virtual "Le mie canzoni" collection from Track rows only.
 * Playlist memberships are intentionally not part of this selector.
 */
export function selectAllSongs(tracks: readonly Track[]) {
  const tracksById = new Map<string, Track>();

  for (const track of tracks) {
    tracksById.set(track.id, track);
  }

  return [...tracksById.values()].sort(
    (left, right) => downloadedAtTime(right) - downloadedAtTime(left),
  );
}
