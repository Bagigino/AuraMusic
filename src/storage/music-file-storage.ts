import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export const MUSIC_DIRECTORY_NAME = 'music';

const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]+$/;

export type ManagedAudioFileState =
  | { status: 'missing'; uri: string; size: null }
  | { status: 'invalid'; uri: string; size: number | null }
  | { status: 'valid'; uri: string; size: number };

export class MusicFileStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MusicFileStorageError';
    this.code = code;
  }
}

export function getMusicDirectory() {
  return new Directory(Paths.document, MUSIC_DIRECTORY_NAME);
}

export function ensureMusicDirectory() {
  const directory = getMusicDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

export function getManagedAudioFile(videoId: string) {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    throw new MusicFileStorageError(
      'INVALID_TRACK_ID',
      'Il video ID non puo essere usato come nome file locale.',
    );
  }
  return new File(getMusicDirectory(), `${videoId}.m4a`);
}

export function inspectManagedAudioFile(videoId: string): ManagedAudioFileState {
  const file = getManagedAudioFile(videoId);
  if (!file.exists) {
    return { status: 'missing', uri: file.uri, size: null };
  }
  if (file.size <= 0) {
    return { status: 'invalid', uri: file.uri, size: file.size };
  }
  return { status: 'valid', uri: file.uri, size: file.size };
}

export function verifyManagedAudioFile(videoId: string, localUri: string) {
  const expectedFile = getManagedAudioFile(videoId);
  let receivedFile: File;
  try {
    receivedFile = new File(localUri);
  } catch {
    throw new MusicFileStorageError(
      'INVALID_LOCAL_URI',
      'Il modulo nativo ha restituito un localUri non valido.',
    );
  }

  if (receivedFile.uri !== expectedFile.uri) {
    throw new MusicFileStorageError(
      'UNSAFE_LOCAL_PATH',
      'Il file scaricato non appartiene alla directory musicale gestita.',
    );
  }

  const state = inspectManagedAudioFile(videoId);
  if (state.status !== 'valid') {
    throw new MusicFileStorageError(
      'FINAL_FILE_MISSING',
      'Il file M4A finale manca o non contiene dati.',
    );
  }
  return state;
}

export function localTrackFileExists(localUri: string) {
  if (Platform.OS === 'web') {
    return true;
  }
  try {
    const file = new File(localUri);
    return file.exists && file.size > 0;
  } catch {
    return false;
  }
}

export function deleteManagedAudioFile(localUri: string) {
  if (Platform.OS === 'web') {
    return;
  }

  let file: File;
  try {
    file = new File(localUri);
  } catch {
    throw new MusicFileStorageError(
      'UNSAFE_DELETE_PATH',
      'Il percorso audio non e valido e non verra eliminato.',
    );
  }

  const managedDirectory = getMusicDirectory();
  if (
    file.parentDirectory.uri !== managedDirectory.uri ||
    file.extension.toLowerCase() !== '.m4a'
  ) {
    throw new MusicFileStorageError(
      'UNSAFE_DELETE_PATH',
      'AuraMusic puo eliminare soltanto file M4A nella propria directory musicale.',
    );
  }

  if (file.exists) {
    file.delete();
  }
}
