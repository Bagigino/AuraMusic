import type { Playlist, PlaylistTrack } from '../models/playlist';
import type { Track } from '../models/track';

export const BACKUP_FORMAT = 'auramusic-backup' as const;
export const BACKUP_FORMAT_VERSION = 1 as const;
export const BACKUP_MANIFEST_FILE = 'manifest.json';
export const BACKUP_LIBRARY_FILE = 'library.json';
export const BACKUP_MUSIC_DIRECTORY = 'music';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,200}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type BackupFileRecord = {
  file: string;
  size: number;
  sha256: string;
};

export type BackupManifestV1 = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_FORMAT_VERSION;
  createdAt: number;
  appVersion: string;
  trackCount: number;
  playlistCount: number;
  skippedTrackCount: number;
  totalAudioBytes: number;
  files: BackupFileRecord[];
};

export type BackupTrackV1 = Omit<Track, 'localUri' | 'missingLocalFile'> & {
  audioFileName: string;
};

export type BackupPlaylistV1 = Playlist;
export type BackupPlaylistTrackV1 = PlaylistTrack;

export type BackupLibraryV1 = {
  tracks: BackupTrackV1[];
  playlists: BackupPlaylistV1[];
  playlistTracks: BackupPlaylistTrackV1[];
};

export type ValidatedBackupV1 = {
  manifest: BackupManifestV1;
  library: BackupLibraryV1;
};

export class BackupValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackupValidationError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new BackupValidationError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') {
    fail('INVALID_BACKUP_JSON', `Il campo ${field} non e valido.`);
  }
  return value;
}

function finiteNumberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_BACKUP_JSON', `Il campo ${field} non e valido.`);
  }
  return value;
}

function nonNegativeIntegerField(record: Record<string, unknown>, field: string): number {
  const value = finiteNumberField(record, field);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_BACKUP_JSON', `Il campo ${field} non e valido.`);
  }
  return value;
}

export function isSafeBackupIdentifier(value: string) {
  return SAFE_IDENTIFIER.test(value);
}

export function getBackupAudioFileName(trackId: string) {
  if (!isSafeBackupIdentifier(trackId)) {
    fail('INVALID_TRACK_ID', 'Un Track ID non puo essere usato nel backup.');
  }
  return `${trackId}.m4a`;
}

export function isSafeBackupAudioFileName(fileName: string) {
  if (!/^[A-Za-z0-9_-]{1,200}\.m4a$/.test(fileName)) {
    return false;
  }
  return !fileName.includes('/') && !fileName.includes('\\') && !fileName.includes('..');
}

export function isSafeBackupArchiveEntry(entry: string) {
  if (
    !entry ||
    entry.startsWith('/') ||
    entry.includes('\\') ||
    entry.includes(':') ||
    entry.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    return false;
  }
  if (entry === BACKUP_MANIFEST_FILE || entry === BACKUP_LIBRARY_FILE) {
    return true;
  }
  const prefix = `${BACKUP_MUSIC_DIRECTORY}/`;
  return entry.startsWith(prefix) && isSafeBackupAudioFileName(entry.slice(prefix.length));
}

export function serializeTrackForBackup(track: Track): BackupTrackV1 {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    sourceUrl: track.sourceUrl,
    downloadedAt: track.downloadedAt,
    audioFileName: getBackupAudioFileName(track.id),
  };
}

export function buildPortableLibrary(
  tracks: readonly Track[],
  playlists: readonly Playlist[],
  playlistTracks: readonly PlaylistTrack[],
): BackupLibraryV1 {
  const exportedTrackIds = new Set(tracks.map(({ id }) => id));
  return {
    tracks: tracks.map(serializeTrackForBackup),
    playlists: playlists.map((playlist) => ({ ...playlist })),
    playlistTracks: playlistTracks
      .filter(({ trackId }) => exportedTrackIds.has(trackId))
      .map((membership) => ({ ...membership })),
  };
}

export function selectExportableTracks(
  tracks: readonly Track[],
  canExport: (track: Track) => boolean,
) {
  const exportableTracks: Track[] = [];
  const skippedTrackIds: string[] = [];
  for (const track of tracks) {
    try {
      if (canExport(track)) {
        exportableTracks.push(track);
      } else {
        skippedTrackIds.push(track.id);
      }
    } catch {
      skippedTrackIds.push(track.id);
    }
  }
  return { exportableTracks, skippedTrackIds };
}

function parseJsonObject(json: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('INVALID_BACKUP_JSON', `${label} non contiene JSON valido.`);
  }
  if (!isRecord(parsed)) {
    fail('INVALID_BACKUP_JSON', `${label} non contiene un oggetto JSON.`);
  }
  return parsed;
}

export function parseBackupManifest(json: string): BackupManifestV1 {
  const value = parseJsonObject(json, BACKUP_MANIFEST_FILE);
  if (stringField(value, 'format') !== BACKUP_FORMAT) {
    fail('INVALID_BACKUP_FORMAT', 'Il file selezionato non e un backup AuraMusic.');
  }
  const version = finiteNumberField(value, 'version');
  if (version !== BACKUP_FORMAT_VERSION) {
    fail(
      'UNSUPPORTED_BACKUP_VERSION',
      `La versione backup ${version} non e supportata da questa versione di AuraMusic.`,
    );
  }
  const filesValue = value.files;
  if (!Array.isArray(filesValue)) {
    fail('INVALID_BACKUP_JSON', 'La lista files del manifest non e valida.');
  }
  const files = filesValue.map((item) => {
    if (!isRecord(item)) {
      fail('INVALID_BACKUP_JSON', 'Una voce files del manifest non e valida.');
    }
    const file = stringField(item, 'file');
    const size = nonNegativeIntegerField(item, 'size');
    const sha256 = stringField(item, 'sha256').toLowerCase();
    if (!isSafeBackupAudioFileName(file) || size <= 0 || !SHA256.test(sha256)) {
      fail('INVALID_BACKUP_FILE', 'Il manifest contiene un file audio non valido.');
    }
    return { file, size, sha256 };
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: nonNegativeIntegerField(value, 'createdAt'),
    appVersion: stringField(value, 'appVersion'),
    trackCount: nonNegativeIntegerField(value, 'trackCount'),
    playlistCount: nonNegativeIntegerField(value, 'playlistCount'),
    skippedTrackCount: nonNegativeIntegerField(value, 'skippedTrackCount'),
    totalAudioBytes: nonNegativeIntegerField(value, 'totalAudioBytes'),
    files,
  };
}

function parseTrack(value: unknown): BackupTrackV1 {
  if (!isRecord(value)) {
    fail('INVALID_BACKUP_JSON', 'Una Track del backup non e valida.');
  }
  const id = stringField(value, 'id');
  const duration = finiteNumberField(value, 'duration');
  const audioFileName = stringField(value, 'audioFileName');
  if (!isSafeBackupIdentifier(id) || duration < 0 || audioFileName !== getBackupAudioFileName(id)) {
    fail('INVALID_BACKUP_TRACK', 'Una Track contiene ID, durata o nome audio non validi.');
  }
  return {
    id,
    title: stringField(value, 'title'),
    artist: stringField(value, 'artist'),
    thumbnail: stringField(value, 'thumbnail'),
    duration,
    sourceUrl: stringField(value, 'sourceUrl'),
    downloadedAt: stringField(value, 'downloadedAt'),
    audioFileName,
  };
}

function parsePlaylist(value: unknown): BackupPlaylistV1 {
  if (!isRecord(value)) {
    fail('INVALID_BACKUP_JSON', 'Una playlist del backup non e valida.');
  }
  const id = stringField(value, 'id');
  const name = stringField(value, 'name');
  if (!isSafeBackupIdentifier(id)) {
    fail('INVALID_BACKUP_PLAYLIST', 'Una playlist contiene un ID non valido.');
  }
  if (!name.trim() || name.length > 60) {
    fail('INVALID_BACKUP_PLAYLIST', 'Una playlist contiene un nome non valido.');
  }
  return {
    id,
    name,
    createdAt: nonNegativeIntegerField(value, 'createdAt'),
    updatedAt: nonNegativeIntegerField(value, 'updatedAt'),
  };
}

function parsePlaylistTrack(value: unknown): BackupPlaylistTrackV1 {
  if (!isRecord(value)) {
    fail('INVALID_BACKUP_JSON', 'Una relazione playlist/Track non e valida.');
  }
  const playlistId = stringField(value, 'playlistId');
  const trackId = stringField(value, 'trackId');
  if (!isSafeBackupIdentifier(playlistId) || !isSafeBackupIdentifier(trackId)) {
    fail('INVALID_BACKUP_MEMBERSHIP', 'Una relazione contiene un ID non valido.');
  }
  return {
    playlistId,
    trackId,
    position: nonNegativeIntegerField(value, 'position'),
    addedAt: nonNegativeIntegerField(value, 'addedAt'),
  };
}

export function parseBackupLibrary(json: string): BackupLibraryV1 {
  const value = parseJsonObject(json, BACKUP_LIBRARY_FILE);
  if (!Array.isArray(value.tracks) || !Array.isArray(value.playlists) || !Array.isArray(value.playlistTracks)) {
    fail('INVALID_BACKUP_JSON', 'library.json non contiene tutte le collezioni richieste.');
  }
  return {
    tracks: value.tracks.map(parseTrack),
    playlists: value.playlists.map(parsePlaylist),
    playlistTracks: value.playlistTracks.map(parsePlaylistTrack),
  };
}

function assertUnique(values: readonly string[], code: string, message: string) {
  if (new Set(values).size !== values.length) {
    fail(code, message);
  }
}

export function validateBackupV1(
  manifest: BackupManifestV1,
  library: BackupLibraryV1,
): ValidatedBackupV1 {
  assertUnique(library.tracks.map(({ id }) => id), 'DUPLICATE_TRACK', 'Il backup contiene Track duplicate.');
  assertUnique(library.playlists.map(({ id }) => id), 'DUPLICATE_PLAYLIST', 'Il backup contiene playlist duplicate.');
  assertUnique(library.playlists.map(({ name }) => name.toLowerCase()), 'DUPLICATE_PLAYLIST', 'Il backup contiene nomi playlist duplicati.');
  assertUnique(manifest.files.map(({ file }) => file), 'DUPLICATE_FILE', 'Il manifest contiene file duplicati.');

  if (manifest.trackCount !== library.tracks.length || manifest.files.length !== library.tracks.length) {
    fail('BACKUP_COUNT_MISMATCH', 'Il numero di Track nel manifest non corrisponde a library.json.');
  }
  if (manifest.playlistCount !== library.playlists.length) {
    fail('BACKUP_COUNT_MISMATCH', 'Il numero di playlist nel manifest non corrisponde a library.json.');
  }
  if (manifest.totalAudioBytes !== manifest.files.reduce((total, item) => total + item.size, 0)) {
    fail('BACKUP_SIZE_MISMATCH', 'La dimensione totale nel manifest non e coerente.');
  }

  const trackIds = new Set(library.tracks.map(({ id }) => id));
  const playlistIds = new Set(library.playlists.map(({ id }) => id));
  const expectedFiles = new Set(library.tracks.map(({ audioFileName }) => audioFileName));
  const manifestFiles = new Set(manifest.files.map(({ file }) => file));
  if (expectedFiles.size !== manifestFiles.size || [...expectedFiles].some((file) => !manifestFiles.has(file))) {
    fail('BACKUP_FILE_MISMATCH', 'I file del manifest non corrispondono alle Track.');
  }

  const membershipKeys: string[] = [];
  for (const membership of library.playlistTracks) {
    if (!trackIds.has(membership.trackId) || !playlistIds.has(membership.playlistId)) {
      fail('INVALID_BACKUP_MEMBERSHIP', 'Una relazione fa riferimento a dati inesistenti.');
    }
    membershipKeys.push(`${membership.playlistId}\0${membership.trackId}`);
  }
  assertUnique(membershipKeys, 'DUPLICATE_MEMBERSHIP', 'Il backup contiene relazioni duplicate.');

  return { manifest, library };
}

export function reconstructTrackFromBackup(track: BackupTrackV1, localUri: string): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    sourceUrl: track.sourceUrl,
    localUri,
    downloadedAt: track.downloadedAt,
    missingLocalFile: false,
  };
}
