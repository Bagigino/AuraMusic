import { useRouter } from 'expo-router';
import { useReducer } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { NativeModuleDebugCard } from '@/components/native-module-debug-card';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { TEST_TRACK_SOURCE_URL } from '@/constants/test-track';
import { useTrackLibrary } from '@/library/track-library-context';
import {
  createInitialDownloadFlowState,
  downloadFlowReducer,
} from '@/services/download-flow-state';
import type { DownloadProgress } from '@/services/download-service';
import { formatDuration } from '@/utils/format-duration';

function getUserFacingError(error: unknown) {
  const nativeError = error as { code?: unknown; message?: unknown };
  const code = typeof nativeError?.code === 'string' ? nativeError.code : null;
  const messages: Record<string, string> = {
    INVALID_URL: 'Inserisci un URL HTTPS YouTube valido.',
    NO_M4A_FORMAT: 'No compatible M4A audio format available.',
    NETWORK_ERROR: 'YouTube non e raggiungibile. Controlla la connessione.',
    NETWORK_TIMEOUT: 'La richiesta a YouTube ha superato il timeout.',
    TLS_ERROR: 'La connessione sicura a YouTube non e riuscita.',
    JS_CHALLENGE_ERROR: 'La challenge YouTube non e stata risolta.',
    APPLE_PROVIDER_UNAVAILABLE: 'Il provider Apple WebKit non e disponibile.',
    PRIVATE_VIDEO: 'Il video YouTube e privato.',
    RESTRICTED_VIDEO: 'Il video richiede accesso o e soggetto a restrizioni.',
    VIDEO_UNAVAILABLE: 'Il video non esiste piu o non e disponibile.',
    UNSUPPORTED_URL: 'yt-dlp non riconosce questo URL YouTube.',
    EXTRACTOR_ERROR: 'yt-dlp non e riuscito ad analizzare il video.',
    DOWNLOAD_INTERRUPTED: 'Il download e stato interrotto.',
    DOWNLOAD_IN_PROGRESS: 'Un download audio e gia in corso.',
    DISK_FULL: 'Spazio insufficiente sul dispositivo.',
    FILESYSTEM_ERROR: 'Non e stato possibile salvare il file audio.',
    FINAL_FILE_MISSING: 'Il file M4A finale non e stato trovato.',
    INVALID_DOWNLOAD_RESULT: 'Il modulo nativo ha restituito un file inatteso.',
    UNSAFE_LOCAL_PATH: 'Il file scaricato non si trova nella directory gestita.',
    EXISTING_FILE_INVALID: 'Il file M4A esistente e vuoto o non valido.',
    DUPLICATE_TRACK: 'This track is already in your library.',
    SQLITE_SAVE_FAILED: 'Il file e stato scaricato, ma il salvataggio in Library e fallito.',
  };
  if (code && messages[code]) {
    return messages[code];
  }
  return typeof nativeError?.message === 'string'
    ? nativeError.message
    : 'Si e verificato un errore inatteso.';
}

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return 'n/d';
  }
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

function getProgressText(progress: DownloadProgress | null) {
  if (!progress || progress.status === 'preparing') {
    return 'Preparing download...';
  }
  const total = progress.totalBytes ?? progress.totalBytesEstimate;
  const percentage = progress.progress === null ? '' : ` ${Math.round(progress.progress * 100)}%`;
  return `Downloading...${percentage} · ${formatBytes(progress.downloadedBytes)} / ${formatBytes(total)}`;
}

export default function AddTrackScreen() {
  const router = useRouter();
  const { analyzeTrack, addTrack } = useTrackLibrary();
  const [state, dispatch] = useReducer(
    downloadFlowReducer,
    Platform.OS === 'web' ? TEST_TRACK_SOURCE_URL : '',
    createInitialDownloadFlowState,
  );

  const isBusy = ['analyzing', 'downloading', 'saving'].includes(state.status);
  const canDownload =
    state.status === 'ready' &&
    state.info?.hasM4aAudio === true &&
    !state.duplicate;

  const handleAnalyze = async () => {
    dispatch({ type: 'ANALYZE_STARTED' });
    try {
      const result = await analyzeTrack(state.sourceUrl.trim());
      dispatch({
        type: 'ANALYZE_SUCCEEDED',
        info: result.info,
        duplicate: result.duplicate,
        duplicateMissingFile: result.duplicateMissingFile,
      });
    } catch (analysisError) {
      dispatch({ type: 'FAILED', message: getUserFacingError(analysisError) });
    }
  };

  const handleDownload = async () => {
    if (!canDownload) {
      return;
    }
    dispatch({ type: 'DOWNLOAD_STARTED' });
    try {
      const track = await addTrack(
        state.sourceUrl.trim(),
        (progress) => dispatch({ type: 'DOWNLOAD_PROGRESS', progress }),
        (phase) => {
          if (phase === 'saving') {
            dispatch({ type: 'SAVE_STARTED' });
          }
        },
      );
      dispatch({ type: 'COMPLETED', track });
    } catch (downloadError) {
      dispatch({ type: 'FAILED', message: getUserFacingError(downloadError) });
    }
  };

  return (
    <AuraScreen
      title="Add Track"
      subtitle={
        Platform.OS === 'web'
          ? 'La versione web mantiene il catalogo demo e non esegue yt-dlp.'
          : 'Analizza un URL YouTube e salva il formato M4A audio-only sul dispositivo.'
      }>
      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>YOUTUBE URL</Text>
        <TextInput
          accessibilityLabel="YouTube URL"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          keyboardType="url"
          onChangeText={(sourceUrl) => dispatch({ type: 'URL_CHANGED', sourceUrl })}
          placeholder="https://www.youtube.com/watch?v=..."
          placeholderTextColor={AuraColors.textMuted}
          style={styles.urlInput}
          value={state.sourceUrl}
        />
        <AuraButton
          disabled={isBusy || state.sourceUrl.trim().length === 0}
          label="Analyze"
          loading={state.status === 'analyzing'}
          onPress={() => void handleAnalyze()}
          variant="secondary"
        />
      </View>

      {state.info && (
        <View style={styles.previewCard}>
          <TrackArtwork size={180} thumbnail={state.info.thumbnail} />
          <View style={styles.trackInfo}>
            <Text style={styles.title}>{state.info.title}</Text>
            <Text style={styles.artist}>{state.info.artist}</Text>
            <View style={styles.badges}>
              <Text style={styles.badge}>{formatDuration(state.info.duration)}</Text>
              <Text
                style={[
                  styles.badge,
                  state.info.hasM4aAudio ? styles.offlineBadge : styles.missingBadge,
                ]}>
                {state.info.hasM4aAudio ? 'M4A READY' : 'NO M4A'}
              </Text>
            </View>
          </View>

          {state.duplicate && (
            <Text style={styles.warning}>
              {state.duplicateMissingFile
                ? 'Il brano e gia nella Library, ma il file locale risulta mancante.'
                : 'This track is already in your library.'}
            </Text>
          )}
          {!state.info.hasM4aAudio && (
            <Text style={styles.warning}>No compatible M4A audio format available.</Text>
          )}

          <AuraButton
            disabled={!canDownload || isBusy}
            label="Download"
            loading={state.status === 'downloading' || state.status === 'saving'}
            onPress={() => void handleDownload()}
          />
        </View>
      )}

      {(state.status === 'downloading' || state.status === 'saving') && (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>
            {state.status === 'saving' ? 'Saving to Library...' : getProgressText(state.progress)}
          </Text>
        </View>
      )}

      {state.status === 'completed' && state.completedTrack && (
        <View style={styles.statusCard}>
          <Text style={styles.success}>Download completato e salvato nella Library.</Text>
          <AuraButton label="Apri Library" onPress={() => router.push('/')} variant="secondary" />
        </View>
      )}

      {state.status === 'error' && state.error && (
        <Text style={styles.error}>{state.error}</Text>
      )}

      <NativeModuleDebugCard />
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: 12,
    padding: 20,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  inputLabel: {
    color: AuraColors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  urlInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderColor: AuraColors.border,
    borderWidth: 1,
    backgroundColor: AuraColors.background,
    color: AuraColors.text,
    fontSize: 14,
  },
  previewCard: {
    alignItems: 'center',
    gap: 18,
    marginTop: 18,
    padding: 22,
    borderRadius: 26,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  trackInfo: {
    alignItems: 'center',
  },
  title: {
    color: AuraColors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  artist: {
    color: AuraColors.textMuted,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
  },
  badge: {
    color: AuraColors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: AuraColors.surfaceRaised,
  },
  offlineBadge: {
    color: AuraColors.success,
  },
  missingBadge: {
    color: AuraColors.danger,
  },
  warning: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  statusCard: {
    gap: 12,
    marginTop: 18,
    padding: 18,
    borderRadius: 18,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  statusTitle: {
    color: AuraColors.text,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  success: {
    color: AuraColors.success,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },
});
