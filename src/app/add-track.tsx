import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { NativeModuleDebugCard } from '@/components/native-module-debug-card';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import {
  TEST_TRACK_ID,
  TEST_TRACK_INFO,
  TEST_TRACK_SOURCE_URL,
} from '@/constants/test-track';
import { useTrackLibrary } from '@/library/track-library-context';
import { formatDuration } from '@/utils/format-duration';

export default function AddTrackScreen() {
  const router = useRouter();
  const { tracks, isAdding, error, addTrack } = useTrackLibrary();
  const [wasAdded, setWasAdded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const isAlreadyAdded = tracks.some((track) => track.id === TEST_TRACK_ID);
  const isWeb = Platform.OS === 'web';

  const handleAddTrack = async () => {
    try {
      setDownloadProgress(0);
      await addTrack(TEST_TRACK_SOURCE_URL, setDownloadProgress);
      setWasAdded(true);
    } catch {
      setWasAdded(false);
    }
  };

  return (
    <AuraScreen
      title="Add Track"
      subtitle="Per questa prima versione è disponibile un brano M4A incluso nell’app.">
      <View style={styles.previewCard}>
        <TrackArtwork size={150} />
        <View style={styles.trackInfo}>
          <Text style={styles.title}>{TEST_TRACK_INFO.title}</Text>
          <Text style={styles.artist}>{TEST_TRACK_INFO.artist}</Text>
          <View style={styles.badges}>
            <Text style={styles.badge}>M4A</Text>
            <Text style={styles.badge}>{formatDuration(TEST_TRACK_INFO.duration)}</Text>
            <Text style={[styles.badge, styles.offlineBadge]}>
              {isWeb ? 'MOCK WEB' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Destinazione</Text>
          <Text style={styles.detailValue}>
            {isWeb ? 'Asset bundle (simulato)' : 'Documents/music'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Metadata</Text>
          <Text style={styles.detailValue}>SQLite locale</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <AuraButton
          disabled={isAlreadyAdded}
          label={isAlreadyAdded ? 'Già nella libreria' : 'Aggiungi alla libreria'}
          loading={isAdding}
          onPress={() => void handleAddTrack()}
        />
        {isAdding && (
          <Text style={styles.progress}>Preparazione file: {Math.round(downloadProgress * 100)}%</Text>
        )}
        {(wasAdded || isAlreadyAdded) && (
          <AuraButton label="Apri Library" onPress={() => router.push('/')} variant="secondary" />
        )}
      </View>

      {wasAdded && (
        <Text style={styles.success}>
          {isWeb
            ? 'Brano MOCK salvato nella libreria web; la copia persistente è simulata.'
            : 'Brano copiato nella directory persistente e salvato nella libreria.'}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <NativeModuleDebugCard />
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 28,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 20,
  },
  title: {
    color: AuraColors.text,
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  artist: {
    color: AuraColors.textMuted,
    fontSize: 15,
    marginTop: 5,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  badge: {
    color: AuraColors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: AuraColors.surfaceRaised,
  },
  offlineBadge: {
    color: AuraColors.success,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: AuraColors.border,
    marginVertical: 24,
  },
  detailRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginVertical: 5,
  },
  detailLabel: {
    color: AuraColors.textMuted,
    fontSize: 13,
  },
  detailValue: {
    color: AuraColors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  actions: {
    gap: 12,
    marginTop: 18,
  },
  progress: {
    color: AuraColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  success: {
    color: AuraColors.success,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },
});
