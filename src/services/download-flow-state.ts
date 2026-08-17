import type { Track } from '../models/track';
import type { DownloadInfo, DownloadProgress } from './download-service';

export type DownloadFlowStatus =
  | 'idle'
  | 'analyzing'
  | 'ready'
  | 'downloading'
  | 'saving'
  | 'completed'
  | 'error';

export type DownloadFlowState = {
  status: DownloadFlowStatus;
  sourceUrl: string;
  info: DownloadInfo | null;
  progress: DownloadProgress | null;
  completedTrack: Track | null;
  duplicate: boolean;
  duplicateMissingFile: boolean;
  error: string | null;
};

export type DownloadFlowAction =
  | { type: 'URL_CHANGED'; sourceUrl: string }
  | { type: 'ANALYZE_STARTED' }
  | {
      type: 'ANALYZE_SUCCEEDED';
      info: DownloadInfo;
      duplicate: boolean;
      duplicateMissingFile: boolean;
    }
  | { type: 'DOWNLOAD_STARTED' }
  | { type: 'DOWNLOAD_PROGRESS'; progress: DownloadProgress }
  | { type: 'SAVE_STARTED' }
  | { type: 'COMPLETED'; track: Track }
  | { type: 'FAILED'; message: string };

export function createInitialDownloadFlowState(sourceUrl = ''): DownloadFlowState {
  return {
    status: 'idle',
    sourceUrl,
    info: null,
    progress: null,
    completedTrack: null,
    duplicate: false,
    duplicateMissingFile: false,
    error: null,
  };
}

export function downloadFlowReducer(
  state: DownloadFlowState,
  action: DownloadFlowAction,
): DownloadFlowState {
  switch (action.type) {
    case 'URL_CHANGED':
      return createInitialDownloadFlowState(action.sourceUrl);
    case 'ANALYZE_STARTED':
      return {
        ...createInitialDownloadFlowState(state.sourceUrl),
        status: 'analyzing',
      };
    case 'ANALYZE_SUCCEEDED':
      return {
        ...state,
        status: 'ready',
        info: action.info,
        duplicate: action.duplicate,
        duplicateMissingFile: action.duplicateMissingFile,
        error: null,
      };
    case 'DOWNLOAD_STARTED':
      return {
        ...state,
        status: 'downloading',
        progress: null,
        completedTrack: null,
        error: null,
      };
    case 'DOWNLOAD_PROGRESS':
      if (state.status !== 'downloading') {
        return state;
      }
      return {
        ...state,
        status: 'downloading',
        progress: action.progress,
      };
    case 'SAVE_STARTED':
      return { ...state, status: 'saving' };
    case 'COMPLETED':
      return {
        ...state,
        status: 'completed',
        completedTrack: action.track,
        progress: state.progress
          ? { ...state.progress, status: 'finished', progress: 1 }
          : null,
        error: null,
      };
    case 'FAILED':
      return { ...state, status: 'error', error: action.message };
  }
}
