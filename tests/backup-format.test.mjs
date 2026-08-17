import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupValidationError,
  buildPortableLibrary,
  isSafeBackupArchiveEntry,
  parseBackupLibrary,
  parseBackupManifest,
  reconstructTrackFromBackup,
  selectExportableTracks,
  serializeTrackForBackup,
  validateBackupV1,
} from '../src/backup/backup-format.ts';

function track(id, overrides = {}) {
  return {
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    thumbnail: 'https://example.test/cover.jpg',
    duration: 180,
    sourceUrl: `https://youtube.com/watch?v=${id}`,
    localUri: `file:///old-container/Documents/music/${id}.m4a`,
    downloadedAt: '2026-08-17T10:00:00.000Z',
    missingLocalFile: false,
    ...overrides,
  };
}

function sample() {
  const tracks = [track('video_1'), track('video-2')];
  const playlists = [
    { id: 'playlist_one', name: 'One', createdAt: 10, updatedAt: 20 },
    { id: 'playlist_two', name: 'Two', createdAt: 11, updatedAt: 21 },
  ];
  const playlistTracks = [
    { playlistId: 'playlist_one', trackId: 'video_1', position: 4, addedAt: 30 },
    { playlistId: 'playlist_two', trackId: 'video_1', position: 1, addedAt: 31 },
    { playlistId: 'playlist_two', trackId: 'video-2', position: 0, addedAt: 32 },
  ];
  const library = buildPortableLibrary(tracks, playlists, playlistTracks);
  const files = library.tracks.map(({ audioFileName }, index) => ({
    file: audioFileName,
    size: index + 100,
    sha256: `${index + 1}`.repeat(64),
  }));
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: 123,
    appVersion: '1.0.0',
    trackCount: tracks.length,
    playlistCount: playlists.length,
    skippedTrackCount: 0,
    totalAudioBytes: files.reduce((total, item) => total + item.size, 0),
    files,
  };
  return { tracks, playlists, playlistTracks, library, manifest };
}

test('Track export is portable: audioFileName is present and localUri is absent', () => {
  const serialized = serializeTrackForBackup(track('portable_id'));
  assert.equal(serialized.audioFileName, 'portable_id.m4a');
  assert.equal(Object.hasOwn(serialized, 'localUri'), false);
  assert.equal(Object.hasOwn(serialized, 'missingLocalFile'), false);
});

test('real playlists, multi-playlist membership and positions are preserved', () => {
  const { library } = sample();
  assert.deepEqual(library.playlists.map(({ name }) => name), ['One', 'Two']);
  assert.equal(library.playlists.some(({ name }) => name === 'Le mie canzoni'), false);
  assert.deepEqual(
    library.playlistTracks.filter(({ trackId }) => trackId === 'video_1'),
    [
      { playlistId: 'playlist_one', trackId: 'video_1', position: 4, addedAt: 30 },
      { playlistId: 'playlist_two', trackId: 'video_1', position: 1, addedAt: 31 },
    ],
  );
});

test('missing or invalid audio tracks are skipped and their memberships are excluded', () => {
  const tracks = [track('good'), track('missing'), track('empty')];
  const selection = selectExportableTracks(tracks, ({ id }) => id === 'good');
  assert.deepEqual(selection.exportableTracks.map(({ id }) => id), ['good']);
  assert.deepEqual(selection.skippedTrackIds, ['missing', 'empty']);
  const library = buildPortableLibrary(
    selection.exportableTracks,
    [{ id: 'playlist', name: 'Playlist', createdAt: 1, updatedAt: 2 }],
    [
      { playlistId: 'playlist', trackId: 'good', position: 0, addedAt: 3 },
      { playlistId: 'playlist', trackId: 'missing', position: 1, addedAt: 4 },
    ],
  );
  assert.deepEqual(library.playlistTracks.map(({ trackId }) => trackId), ['good']);
});

test('valid manifest/library parse and validate as backup version 1', () => {
  const { manifest, library } = sample();
  const parsedManifest = parseBackupManifest(JSON.stringify(manifest));
  const parsedLibrary = parseBackupLibrary(JSON.stringify(library));
  assert.deepEqual(validateBackupV1(parsedManifest, parsedLibrary), {
    manifest,
    library,
  });
});

test('invalid format and unsupported version are rejected with structured codes', () => {
  const { manifest } = sample();
  assert.throws(
    () => parseBackupManifest(JSON.stringify({ ...manifest, format: 'other' })),
    (error) => error instanceof BackupValidationError && error.code === 'INVALID_BACKUP_FORMAT',
  );
  assert.throws(
    () => parseBackupManifest(JSON.stringify({ ...manifest, version: 2 })),
    (error) => error instanceof BackupValidationError && error.code === 'UNSUPPORTED_BACKUP_VERSION',
  );
});

test('missing files, checksum mismatch metadata and broken relations are rejected', () => {
  const { manifest, library } = sample();
  assert.throws(
    () => validateBackupV1({ ...manifest, files: manifest.files.slice(1) }, library),
    (error) => error instanceof BackupValidationError && error.code === 'BACKUP_COUNT_MISMATCH',
  );
  assert.throws(
    () => parseBackupManifest(JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], sha256: 'bad' }] })),
    (error) => error instanceof BackupValidationError && error.code === 'INVALID_BACKUP_FILE',
  );
  assert.throws(
    () => validateBackupV1(manifest, {
      ...library,
      playlistTracks: [{ playlistId: 'missing', trackId: 'video_1', position: 0, addedAt: 1 }],
    }),
    (error) => error instanceof BackupValidationError && error.code === 'INVALID_BACKUP_MEMBERSHIP',
  );
});

test('restore reconstructs localUri using the current sandbox path', () => {
  const backupTrack = serializeTrackForBackup(track('fresh_path'));
  const restored = reconstructTrackFromBackup(
    backupTrack,
    'file:///new-container/Documents/music/fresh_path.m4a',
  );
  assert.equal(restored.localUri, 'file:///new-container/Documents/music/fresh_path.m4a');
  assert.equal(restored.id, 'fresh_path');
  assert.equal(restored.missingLocalFile, false);
});

test('path traversal and dangerous ZIP entry names are rejected', () => {
  for (const entry of [
    '../../escape.m4a',
    '/absolute.m4a',
    'music/../escape.m4a',
    'music\\escape.m4a',
    'C:/escape.m4a',
    'music/file.part',
    'unknown.json',
  ]) {
    assert.equal(isSafeBackupArchiveEntry(entry), false, entry);
  }
  assert.equal(isSafeBackupArchiveEntry('manifest.json'), true);
  assert.equal(isSafeBackupArchiveEntry('library.json'), true);
  assert.equal(isSafeBackupArchiveEntry('music/safe_ID-1.m4a'), true);
});
