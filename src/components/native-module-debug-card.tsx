import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { AuraButton } from '@/components/aura-button';
import { AuraColors } from '@/constants/aura-theme';
import {
  addDownloadProgressListener,
  downloadYouTubeM4a,
  extractYouTubeInfo,
  getNativeMessage,
  testPython,
  testYtDlpAppleProvider,
  testYtDlpImport,
  YouTubeDownloadError,
  YouTubeExtractionError,
  type DownloadedAudioResult,
  type DownloadProgress,
  type YouTubeAudioFormat,
  type YouTubeVideoInfo,
} from '@/native/aura-native-test';

function getErrorMessage(error: unknown) {
  if (error instanceof YouTubeExtractionError || error instanceof YouTubeDownloadError) {
    return `[${error.code}] ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Errore sconosciuto durante il test nativo.';
}

function formatFileSize(fileSize: number | null) {
  return fileSize === null ? 'n/d' : `${(fileSize / 1_048_576).toFixed(2)} MB`;
}

function formatAudioFormat(format: YouTubeAudioFormat) {
  const bitrate = format.bitrate === null ? 'bitrate n/d' : `${format.bitrate} kbps`;
  const fileSize =
    format.fileSize === null ? 'size n/d' : `${(format.fileSize / 1_048_576).toFixed(1)} MB`;
  return `${format.formatId} · ${format.ext ?? 'ext n/d'} · ${format.audioCodec ?? 'codec n/d'} · ${bitrate} · ${fileSize}`;
}

export function NativeModuleDebugCard() {
  const router = useRouter();
  const { playTrack } = useAppAudioPlayer();
  const [message, setMessage] = useState<string | null>(null);
  const [pythonMessage, setPythonMessage] = useState<string | null>(null);
  const [ytDlpMessage, setYtDlpMessage] = useState<string | null>(null);
  const [appleProviderMessage, setAppleProviderMessage] = useState<string | null>(null);
  const [youtubeUrl, setYouTubeUrl] = useState('');
  const [youtubeInfo, setYouTubeInfo] = useState<YouTubeVideoInfo | null>(null);
  const [youtubeMessage, setYouTubeMessage] = useState<string | null>(null);
  const [downloadedAudio, setDownloadedAudio] = useState<DownloadedAudioResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<
    'idle' | 'preparing' | 'downloading' | 'completed'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const youtubeRequestInFlight = useRef(false);
  const downloadRequestInFlight = useRef(false);
  const [activeTest, setActiveTest] = useState<
    | 'native'
    | 'python'
    | 'yt-dlp'
    | 'apple-provider'
    | 'youtube-metadata'
    | 'youtube-download'
    | null
  >(null);

  useEffect(() => {
    const subscription = addDownloadProgressListener((progress) => {
      if (!downloadRequestInFlight.current) {
        return;
      }
      setDownloadProgress(progress);
      setDownloadStatus('downloading');
    });
    return () => subscription.remove();
  }, []);

  const handleTest = async () => {
    setActiveTest('native');
    setMessage(null);
    setError(null);

    try {
      setMessage(await getNativeMessage());
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handleAppleProviderTest = async () => {
    setActiveTest('apple-provider');
    setAppleProviderMessage(null);
    setError(null);

    try {
      const result = await testYtDlpAppleProvider();
      setAppleProviderMessage(
        typeof result === 'string'
          ? result
          : result.success
            ? `Apple WebKit provider ready: ${result.version}`
            : 'Apple WebKit provider unavailable',
      );
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handlePythonTest = async () => {
    setActiveTest('python');
    setPythonMessage(null);
    setError(null);

    try {
      const result = await testPython();
      setPythonMessage(typeof result === 'number' ? `Python result: ${result}` : result);
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handleYtDlpTest = async () => {
    setActiveTest('yt-dlp');
    setYtDlpMessage(null);
    setError(null);

    try {
      const result = await testYtDlpImport();
      setYtDlpMessage(
        typeof result === 'string' ? result : `yt-dlp imported: ${result.version}`,
      );
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setActiveTest(null);
    }
  };

  const handleYouTubeMetadata = async () => {
    if (youtubeRequestInFlight.current) {
      return;
    }

    youtubeRequestInFlight.current = true;
    setActiveTest('youtube-metadata');
    setYouTubeInfo(null);
    setYouTubeMessage(null);
    setError(null);

    try {
      const result = await extractYouTubeInfo(youtubeUrl.trim());
      if (typeof result === 'string') {
        setYouTubeMessage(result);
      } else {
        setYouTubeInfo(result);
      }
    } catch (extractionError) {
      setError(getErrorMessage(extractionError));
    } finally {
      youtubeRequestInFlight.current = false;
      setActiveTest(null);
    }
  };

  const handleYouTubeDownload = async () => {
    if (downloadRequestInFlight.current) {
      return;
    }

    downloadRequestInFlight.current = true;
    setActiveTest('youtube-download');
    setDownloadedAudio(null);
    setDownloadProgress(null);
    setDownloadStatus('preparing');
    setYouTubeMessage(null);
    setError(null);

    try {
      const result = await downloadYouTubeM4a(
        youtubeUrl.trim(),
        youtubeInfo?.preferredM4aFormatId ?? undefined,
      );
      if (typeof result === 'string') {
        setYouTubeMessage(result);
        setDownloadStatus('idle');
      } else {
        setDownloadedAudio(result);
        setDownloadStatus('completed');
      }
    } catch (downloadError) {
      setDownloadStatus('idle');
      setError(getErrorMessage(downloadError));
    } finally {
      downloadRequestInFlight.current = false;
      setActiveTest(null);
    }
  };

  const handlePlayDownloadedAudio = () => {
    if (!downloadedAudio) {
      return;
    }

    try {
      playTrack({
        id: `youtube-debug-${downloadedAudio.videoId}`,
        title: downloadedAudio.title,
        artist: youtubeInfo?.uploader ?? 'YouTube Debug',
        thumbnail: youtubeInfo?.thumbnail ?? '',
        duration: youtubeInfo?.duration ?? 0,
        sourceUrl: youtubeUrl.trim(),
        localUri: downloadedAudio.localUri,
        downloadedAt: new Date().toISOString(),
      });
      router.push('/player');
    } catch (playbackError) {
      setError(getErrorMessage(playbackError));
    }
  };

  const handleYouTubeUrlChange = (value: string) => {
    setYouTubeUrl(value);
    setYouTubeInfo(null);
    setYouTubeMessage(null);
    setDownloadedAudio(null);
    setDownloadProgress(null);
    setDownloadStatus('idle');
  };

  const progressLabel =
    downloadStatus === 'preparing'
      ? 'Preparing'
      : downloadStatus === 'downloading'
        ? downloadProgress?.progress === null || downloadProgress?.progress === undefined
          ? 'Downloading'
          : `Downloading ${Math.round(downloadProgress.progress * 100)}%`
        : downloadStatus === 'completed'
          ? 'Completed'
          : null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>DEBUG · EXPO MODULES API</Text>
      <Text style={styles.title}>Bridge TypeScript → Swift</Text>
      <Text style={styles.description}>
        Verifica che il client in uso contenga il modulo locale AuraNativeTest.
      </Text>

      <AuraButton
        label="Test native module"
        disabled={activeTest !== null}
        loading={activeTest === 'native'}
        onPress={() => void handleTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test Python"
        disabled={activeTest !== null}
        loading={activeTest === 'python'}
        onPress={() => void handlePythonTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test yt-dlp"
        disabled={activeTest !== null}
        loading={activeTest === 'yt-dlp'}
        onPress={() => void handleYtDlpTest()}
        variant="secondary"
      />
      <AuraButton
        label="Test Apple WebKit provider"
        disabled={activeTest !== null}
        loading={activeTest === 'apple-provider'}
        onPress={() => void handleAppleProviderTest()}
        variant="secondary"
      />

      <View style={styles.metadataSection}>
        <Text style={styles.sectionTitle}>YouTube metadata POC</Text>
        <TextInput
          accessibilityLabel="YouTube URL"
          autoCapitalize="none"
          autoCorrect={false}
          editable={activeTest === null}
          keyboardType="url"
          onChangeText={handleYouTubeUrlChange}
          placeholder="https://www.youtube.com/watch?v=..."
          placeholderTextColor={AuraColors.textMuted}
          style={styles.urlInput}
          value={youtubeUrl}
        />
        <AuraButton
          label="Extract YouTube metadata"
          disabled={activeTest !== null || youtubeUrl.trim().length === 0}
          loading={activeTest === 'youtube-metadata'}
          onPress={() => void handleYouTubeMetadata()}
          variant="secondary"
        />
        <AuraButton
          label="Download M4A"
          disabled={activeTest !== null || youtubeUrl.trim().length === 0}
          loading={activeTest === 'youtube-download'}
          onPress={() => void handleYouTubeDownload()}
          variant="secondary"
        />
        {progressLabel && <Text style={styles.downloadStatus}>{progressLabel}</Text>}
      </View>

      {message && <Text style={styles.success}>{message}</Text>}
      {pythonMessage && <Text style={styles.success}>{pythonMessage}</Text>}
      {ytDlpMessage && <Text style={styles.success}>{ytDlpMessage}</Text>}
      {appleProviderMessage && <Text style={styles.success}>{appleProviderMessage}</Text>}
      {youtubeMessage && <Text style={styles.success}>{youtubeMessage}</Text>}
      {youtubeInfo && (
        <View style={styles.metadataResult}>
          <Text style={styles.metadataLine}>Title: {youtubeInfo.title}</Text>
          <Text style={styles.metadataLine}>Uploader: {youtubeInfo.uploader ?? 'n/d'}</Text>
          <Text style={styles.metadataLine}>
            Duration: {youtubeInfo.duration === null ? 'n/d' : `${youtubeInfo.duration} sec`}
          </Text>
          <Text style={styles.metadataLine}>Video ID: {youtubeInfo.id}</Text>
          <Text style={styles.metadataLine}>
            Thumbnail metadata: {youtubeInfo.thumbnail ? 'available' : 'unavailable'}
          </Text>
          <Text style={styles.metadataLine}>
            M4A available: {youtubeInfo.hasM4aAudio ? 'yes' : 'no'}
          </Text>
          <Text style={styles.metadataLine}>
            M4A format: {youtubeInfo.preferredM4aFormatId ?? 'n/d'}
          </Text>
          <Text style={styles.metadataLine}>
            Audio formats found: {youtubeInfo.audioFormats.length}
          </Text>
          {youtubeInfo.audioFormats.map((format, index) => (
            <Text key={`${format.formatId}-${index}`} style={styles.formatLine}>
              {formatAudioFormat(format)}
            </Text>
          ))}
        </View>
      )}
      {downloadedAudio && (
        <View style={styles.metadataResult}>
          <Text style={styles.metadataLine}>
            File: {downloadedAudio.videoId}.m4a
          </Text>
          <Text style={styles.metadataLine}>Format ID: {downloadedAudio.formatId}</Text>
          <Text style={styles.metadataLine}>
            Size: {formatFileSize(downloadedAudio.fileSize)}
          </Text>
          <Text selectable style={styles.uriLine}>
            localUri: {downloadedAudio.localUri}
          </Text>
          {downloadedAudio.alreadyExists && (
            <Text style={styles.success}>File gia presente: nessun nuovo download.</Text>
          )}
          <AuraButton
            label="Play downloaded M4A"
            disabled={activeTest !== null}
            onPress={handlePlayDownloadedAudio}
          />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    marginTop: 28,
    padding: 20,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  eyebrow: {
    color: AuraColors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: AuraColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: AuraColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  metadataSection: {
    gap: 10,
    marginTop: 8,
    paddingTop: 16,
    borderTopColor: AuraColors.border,
    borderTopWidth: 1,
  },
  sectionTitle: {
    color: AuraColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  urlInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderColor: AuraColors.border,
    borderWidth: 1,
    backgroundColor: AuraColors.background,
    color: AuraColors.text,
    fontSize: 14,
  },
  metadataResult: {
    gap: 5,
    padding: 14,
    borderRadius: 14,
    backgroundColor: AuraColors.background,
  },
  metadataLine: {
    color: AuraColors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  formatLine: {
    color: AuraColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  success: {
    color: AuraColors.success,
    fontSize: 13,
    lineHeight: 19,
  },
  downloadStatus: {
    color: AuraColors.accent,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  uriLine: {
    color: AuraColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
