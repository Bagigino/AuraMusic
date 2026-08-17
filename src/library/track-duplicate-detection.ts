import type { Track } from '../models/track';

export type DuplicateTrackStatus = {
  duplicate: boolean;
  duplicateMissingFile: boolean;
};

export function getDuplicateTrackStatus(
  existingTrack: Track | null,
  fileExists: (localUri: string) => boolean,
): DuplicateTrackStatus {
  if (!existingTrack) {
    return { duplicate: false, duplicateMissingFile: false };
  }
  return {
    duplicate: true,
    duplicateMissingFile: !fileExists(existingTrack.localUri),
  };
}
