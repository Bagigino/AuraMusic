import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_LIBRARY_FILE,
  BACKUP_MANIFEST_FILE,
  BACKUP_MUSIC_DIRECTORY,
  type BackupManifestV1,
  type ValidatedBackupV1,
  isSafeBackupArchiveEntry,
  parseBackupLibrary,
  parseBackupManifest,
  selectExportableTracks,
  validateBackupV1,
} from './backup-format';
import { runAtomicLibraryReplace } from './atomic-library-replace';
import {
  createPortableSnapshot,
  getBackupDatabaseSnapshot,
  replaceLibraryRows,
} from '../database/backup-repository';
import {
  createBackupArchive,
  extractBackupArchive,
  inspectBackupArchive,
  sha256File,
  type BackupArchiveEntry,
} from '../native/aura-native-test';
import { getManagedAudioFile, getMusicDirectory } from '../storage/music-file-storage';

const TEMP_BACKUP_PREFIX = 'auramusic-backup-work-';
const TEMP_RESTORE_PREFIX = 'auramusic-restore-work-';
const PREPARED_MUSIC_PREFIX = 'music-restore-';
const ROLLBACK_MUSIC_PREFIX = 'music-rollback-';
const DISK_SAFETY_BYTES = 32 * 1024 * 1024;

export type BackupProgress = {
  phase: 'preparing' | 'copying' | 'archiving' | 'validating' | 'extracting' | 'restoring' | 'done';
  completed: number;
  total: number;
  message: string;
};

export type BackupProgressCallback = (progress: BackupProgress) => void;

export type CreatedBackup = {
  archiveUri: string;
  fileName: string;
  manifest: BackupManifestV1;
  skippedTrackIds: string[];
};

export type InspectedBackup = ValidatedBackupV1 & {
  stagingDirectoryUri: string;
  archiveEntries: BackupArchiveEntry[];
};

export type RestoreResult = {
  trackCount: number;
  playlistCount: number;
  membershipCount: number;
};

export class BackupServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackupServiceError';
    this.code = code;
  }
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emit(
  callback: BackupProgressCallback | undefined,
  phase: BackupProgress['phase'],
  completed: number,
  total: number,
  message: string,
) {
  callback?.({ phase, completed, total, message });
}

function removeDirectoryIfPresent(directory: Directory) {
  try {
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    console.warn('AuraMusic temporary directory cleanup failed', error);
  }
}

function removeFileIfPresent(file: File) {
  try {
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    console.warn('AuraMusic temporary file cleanup failed', error);
  }
}

function assertEnoughDiskSpace(requiredBytes: number) {
  const availableBytes = Paths.availableDiskSpace;
  if (Number.isFinite(availableBytes) && availableBytes >= 0 && availableBytes < requiredBytes) {
    throw new BackupServiceError(
      'DISK_FULL',
      `Spazio insufficiente. Servono circa ${formatBytes(requiredBytes)}, disponibili ${formatBytes(availableBytes)}.`,
    );
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function backupFileName(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `AuraMusic_Backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.aurabackup`;
}

function assertExpectedArchiveEntries(
  entries: readonly BackupArchiveEntry[],
  expectedAudioFileNames?: ReadonlySet<string>,
) {
  const paths = entries.map(({ path }) => path);
  if (new Set(paths).size !== paths.length || paths.some((path) => !isSafeBackupArchiveEntry(path))) {
    throw new BackupServiceError(
      'UNSAFE_ARCHIVE_ENTRY',
      'Il backup contiene percorsi duplicati o non sicuri.',
    );
  }
  if (!paths.includes(BACKUP_MANIFEST_FILE) || !paths.includes(BACKUP_LIBRARY_FILE)) {
    throw new BackupServiceError(
      'MISSING_BACKUP_METADATA',
      'manifest.json o library.json manca dal backup.',
    );
  }
  if (expectedAudioFileNames) {
    const expected = new Set([
      BACKUP_MANIFEST_FILE,
      BACKUP_LIBRARY_FILE,
      ...[...expectedAudioFileNames].map((name) => `${BACKUP_MUSIC_DIRECTORY}/${name}`),
    ]);
    if (expected.size !== paths.length || paths.some((path) => !expected.has(path))) {
      throw new BackupServiceError(
        'BACKUP_FILE_MISMATCH',
        'I file presenti nell’archivio non corrispondono al manifest.',
      );
    }
  }
}

function assertManagedTrackFile(trackId: string, localUri: string) {
  const managedFile = getManagedAudioFile(trackId);
  if (managedFile.uri !== new File(localUri).uri) {
    throw new BackupServiceError(
      'UNSAFE_LOCAL_PATH',
      'Una Track usa un file fuori da Documents/music e verra esclusa.',
    );
  }
  return managedFile;
}

async function verifyStagedAudioFiles(
  inspected: ValidatedBackupV1,
  stagingDirectory: Directory,
  onProgress?: BackupProgressCallback,
) {
  const musicDirectory = new Directory(stagingDirectory, BACKUP_MUSIC_DIRECTORY);
  const total = inspected.manifest.files.length;
  for (let index = 0; index < total; index += 1) {
    const expected = inspected.manifest.files[index];
    emit(onProgress, 'validating', index, total, `Verifica brani ${index + 1}/${total}`);
    const file = new File(musicDirectory, expected.file);
    if (!file.exists || file.size !== expected.size || file.size <= 0) {
      throw new BackupServiceError(
        'MISSING_AUDIO_FILE',
        `Il file ${expected.file} manca o ha una dimensione errata.`,
      );
    }
    const digest = await sha256File(file.uri);
    if (digest.size !== expected.size || digest.sha256.toLowerCase() !== expected.sha256) {
      throw new BackupServiceError(
        'CHECKSUM_MISMATCH',
        `Il checksum di ${expected.file} non corrisponde.`,
      );
    }
  }
}

function safeInspectedDirectory(uri: string) {
  const directory = new Directory(uri);
  const cachePrefix = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
  if (!directory.uri.startsWith(cachePrefix) || !directory.name.startsWith(TEMP_RESTORE_PREFIX)) {
    throw new BackupServiceError('UNSAFE_PATH', 'La directory temporanea di restore non e valida.');
  }
  return directory;
}

export class BackupService {
  constructor(private readonly database: SQLiteDatabase) {}

  async createBackup(onProgress?: BackupProgressCallback): Promise<CreatedBackup> {
    emit(onProgress, 'preparing', 0, 1, 'Preparazione backup…');
    const snapshot = await getBackupDatabaseSnapshot(this.database);
    const inspectedFiles = new Map<string, { trackId: string; source: File; size: number }>();
    const { exportableTracks, skippedTrackIds } = selectExportableTracks(
      snapshot.tracks,
      (track) => {
        const source = assertManagedTrackFile(track.id, track.localUri);
        const valid = source.exists && source.size > 0 && source.extension.toLowerCase() === '.m4a';
        if (valid) {
          inspectedFiles.set(track.id, { trackId: track.id, source, size: source.size });
        }
        return valid;
      },
    );
    const validFiles = exportableTracks.map(({ id }) => inspectedFiles.get(id)!);
    if (skippedTrackIds.length > 0) {
      console.warn(
        `AuraMusic backup excluded ${skippedTrackIds.length} Track(s) without a valid managed M4A`,
      );
    }

    const totalAudioBytes = validFiles.reduce((total, item) => total + item.size, 0);
    assertEnoughDiskSpace(totalAudioBytes * 2 + DISK_SAFETY_BYTES);
    const workDirectory = new Directory(Paths.cache, `${TEMP_BACKUP_PREFIX}${uniqueSuffix()}`);
    const workMusicDirectory = new Directory(workDirectory, BACKUP_MUSIC_DIRECTORY);
    const archiveFile = new File(Paths.cache, backupFileName());
    removeFileIfPresent(archiveFile);

    try {
      workMusicDirectory.create({ intermediates: true });
      const fileRecords: BackupManifestV1['files'] = [];
      for (let index = 0; index < validFiles.length; index += 1) {
        const item = validFiles[index];
        emit(
          onProgress,
          'copying',
          index,
          validFiles.length,
          `Copia brani ${index + 1}/${validFiles.length}`,
        );
        const fileName = `${item.trackId}.m4a`;
        const destination = new File(workMusicDirectory, fileName);
        await item.source.copy(destination);
        const digest = await sha256File(destination.uri);
        if (digest.size !== item.size || digest.size <= 0) {
          throw new BackupServiceError(
            'BACKUP_COPY_FAILED',
            `La copia di ${fileName} non ha superato la verifica.`,
          );
        }
        fileRecords.push({ file: fileName, size: digest.size, sha256: digest.sha256.toLowerCase() });
      }

      const exportedTrackIds = new Set(validFiles.map(({ trackId }) => trackId));
      const library = createPortableSnapshot(snapshot, exportedTrackIds);
      const manifest: BackupManifestV1 = {
        format: BACKUP_FORMAT,
        version: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        trackCount: library.tracks.length,
        playlistCount: library.playlists.length,
        skippedTrackCount: skippedTrackIds.length,
        totalAudioBytes: fileRecords.reduce((total, item) => total + item.size, 0),
        files: fileRecords,
      };
      validateBackupV1(manifest, library);

      const manifestFile = new File(workDirectory, BACKUP_MANIFEST_FILE);
      const libraryFile = new File(workDirectory, BACKUP_LIBRARY_FILE);
      manifestFile.create({ overwrite: true });
      libraryFile.create({ overwrite: true });
      manifestFile.write(JSON.stringify(manifest, null, 2));
      libraryFile.write(JSON.stringify(library, null, 2));

      emit(onProgress, 'archiving', 0, 1, 'Creazione archivio…');
      const entries = await createBackupArchive(workDirectory.uri, archiveFile.uri);
      assertExpectedArchiveEntries(entries, new Set(fileRecords.map(({ file }) => file)));
      if (!archiveFile.exists || archiveFile.size <= 0) {
        throw new BackupServiceError('ARCHIVE_FAILED', 'L’archivio finale non e stato creato.');
      }
      emit(onProgress, 'done', 1, 1, 'Backup pronto');
      return { archiveUri: archiveFile.uri, fileName: archiveFile.name, manifest, skippedTrackIds };
    } catch (error) {
      removeFileIfPresent(archiveFile);
      throw error;
    } finally {
      removeDirectoryIfPresent(workDirectory);
    }
  }

  async inspectBackup(
    archiveUri: string,
    onProgress?: BackupProgressCallback,
  ): Promise<InspectedBackup> {
    emit(onProgress, 'validating', 0, 1, 'Controllo archivio…');
    const entries = await inspectBackupArchive(archiveUri);
    assertExpectedArchiveEntries(entries);
    const uncompressedBytes = entries.reduce((total, entry) => total + entry.size, 0);
    assertEnoughDiskSpace(uncompressedBytes * 2 + DISK_SAFETY_BYTES);

    const stagingDirectory = new Directory(Paths.cache, `${TEMP_RESTORE_PREFIX}${uniqueSuffix()}`);
    try {
      emit(onProgress, 'extracting', 0, 1, 'Estrazione sicura…');
      const extractedEntries = await extractBackupArchive(archiveUri, stagingDirectory.uri);
      assertExpectedArchiveEntries(extractedEntries);
      const manifestFile = new File(stagingDirectory, BACKUP_MANIFEST_FILE);
      const libraryFile = new File(stagingDirectory, BACKUP_LIBRARY_FILE);
      if (!manifestFile.exists || !libraryFile.exists) {
        throw new BackupServiceError('MISSING_BACKUP_METADATA', 'I metadata del backup mancano.');
      }
      const manifest = parseBackupManifest(await manifestFile.text());
      const library = parseBackupLibrary(await libraryFile.text());
      const validated = validateBackupV1(manifest, library);
      const expectedFileNames = new Set(manifest.files.map(({ file }) => file));
      assertExpectedArchiveEntries(extractedEntries, expectedFileNames);
      await verifyStagedAudioFiles(validated, stagingDirectory, onProgress);
      emit(onProgress, 'done', 1, 1, 'Backup verificato');
      return {
        ...validated,
        stagingDirectoryUri: stagingDirectory.uri,
        archiveEntries: extractedEntries,
      };
    } catch (error) {
      removeDirectoryIfPresent(stagingDirectory);
      throw error;
    }
  }

  discardInspectedBackup(inspected: InspectedBackup | null) {
    if (!inspected) return;
    removeDirectoryIfPresent(safeInspectedDirectory(inspected.stagingDirectoryUri));
  }

  deleteCreatedBackup(created: CreatedBackup | null) {
    if (!created) return;
    const file = new File(created.archiveUri);
    const cachePrefix = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
    if (file.uri.startsWith(cachePrefix) && file.name.endsWith('.aurabackup')) {
      removeFileIfPresent(file);
    }
  }

  async restoreBackup(
    inspected: InspectedBackup,
    onProgress?: BackupProgressCallback,
  ): Promise<RestoreResult> {
    const validated = validateBackupV1(inspected.manifest, inspected.library);
    const stagingDirectory = safeInspectedDirectory(inspected.stagingDirectoryUri);
    if (!stagingDirectory.exists) {
      throw new BackupServiceError('RESTORE_SESSION_EXPIRED', 'I file temporanei del restore non sono piu disponibili.');
    }
    await verifyStagedAudioFiles(validated, stagingDirectory, onProgress);
    assertEnoughDiskSpace(validated.manifest.totalAudioBytes + DISK_SAFETY_BYTES);

    const suffix = uniqueSuffix();
    const preparedDirectory = new Directory(Paths.document, `${PREPARED_MUSIC_PREFIX}${suffix}`);
    const rollbackDirectory = new Directory(Paths.document, `${ROLLBACK_MUSIC_PREFIX}${suffix}`);
    removeDirectoryIfPresent(preparedDirectory);
    removeDirectoryIfPresent(rollbackDirectory);
    preparedDirectory.create({ intermediates: true });

    try {
      const sourceMusicDirectory = new Directory(stagingDirectory, BACKUP_MUSIC_DIRECTORY);
      const total = validated.manifest.files.length;
      for (let index = 0; index < total; index += 1) {
        const expected = validated.manifest.files[index];
        emit(onProgress, 'restoring', index, total, `Prepara brani ${index + 1}/${total}`);
        const source = new File(sourceMusicDirectory, expected.file);
        const destination = new File(preparedDirectory, expected.file);
        await source.copy(destination);
        const digest = await sha256File(destination.uri);
        if (digest.size !== expected.size || digest.sha256.toLowerCase() !== expected.sha256) {
          throw new BackupServiceError(
            'CHECKSUM_MISMATCH',
            `La copia ripristinata di ${expected.file} non e valida.`,
          );
        }
      }

      let transactionDatabase: SQLiteDatabase | null = null;
      await runAtomicLibraryReplace({
        runTransaction: (task) =>
          this.database.withExclusiveTransactionAsync(async (transaction) => {
            transactionDatabase = transaction;
            await task();
          }),
        currentFilesExist: () => getMusicDirectory().exists,
        moveCurrentFilesToRollback: () =>
          getMusicDirectory().move(
            new Directory(Paths.document, `${ROLLBACK_MUSIC_PREFIX}${suffix}`),
          ),
        activatePreparedFiles: () =>
          new Directory(Paths.document, `${PREPARED_MUSIC_PREFIX}${suffix}`).move(
            getMusicDirectory(),
          ),
        replaceDatabaseRows: async () => {
          if (!transactionDatabase) {
            throw new BackupServiceError('SQLITE_ERROR', 'La transaction SQLite non e disponibile.');
          }
          await replaceLibraryRows(
            transactionDatabase,
            validated.library,
            (audioFileName) => new File(getMusicDirectory(), audioFileName).uri,
          );
        },
        removeActivatedFiles: async () => {
          const activeDirectory = getMusicDirectory();
          if (activeDirectory.exists) activeDirectory.delete();
        },
        restoreRollbackFiles: () =>
          new Directory(Paths.document, `${ROLLBACK_MUSIC_PREFIX}${suffix}`).move(
            getMusicDirectory(),
          ),
        cleanupRollbackFiles: async () => {
          removeDirectoryIfPresent(rollbackDirectory);
        },
      });

      emit(onProgress, 'done', 1, 1, 'Restore completato');
      return {
        trackCount: validated.library.tracks.length,
        playlistCount: validated.library.playlists.length,
        membershipCount: validated.library.playlistTracks.length,
      };
    } finally {
      removeDirectoryIfPresent(preparedDirectory);
      removeDirectoryIfPresent(stagingDirectory);
    }
  }
}
