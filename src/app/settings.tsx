import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppAudioPlayer } from '@/audio/audio-player-context';
import {
  BackupService,
  type BackupProgress,
  type InspectedBackup,
  formatBytes,
} from '@/backup/backup-service';
import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { AuraColors } from '@/constants/aura-theme';
import { usePlaylists } from '@/library/playlist-context';
import { useTrackLibrary } from '@/library/track-library-context';
import { getUserFacingError } from '@/utils/get-user-facing-error';

type Operation = 'idle' | 'backup' | 'inspect' | 'restore';

function currentLibraryBytes(localUris: readonly string[]) {
  if (Platform.OS === 'web') return null;
  return localUris.reduce((total, uri) => {
    try {
      const file = new File(uri);
      return total + (file.exists ? file.size : 0);
    } catch {
      return total;
    }
  }, 0);
}

function progressLabel(progress: BackupProgress | null) {
  if (!progress) return null;
  return progress.message;
}

function confirmSkippedTracks(skippedCount: number) {
  if (skippedCount === 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Brani esclusi dal backup',
      skippedCount === 1
        ? '1 brano non ha un file M4A locale valido e non verra incluso. Vuoi continuare?'
        : `${skippedCount} brani non hanno un file M4A locale valido e non verranno inclusi. Vuoi continuare?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const service = useMemo(() => new BackupService(database), [database]);
  const { tracks, refreshTracks } = useTrackLibrary();
  const { playlists, refreshPlaylists } = usePlaylists();
  const { clearPlayback } = useAppAudioPlayer();
  const [operation, setOperation] = useState<Operation>('idle');
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<InspectedBackup | null>(null);
  const inspectedRef = useRef<InspectedBackup | null>(null);
  const libraryBytes = useMemo(
    () => currentLibraryBytes(tracks.map(({ localUri }) => localUri)),
    [tracks],
  );
  const isBusy = operation !== 'idle';
  const nativeUnavailable = Platform.OS !== 'ios';

  const storeInspectedBackup = (value: InspectedBackup | null) => {
    inspectedRef.current = value;
    setInspected(value);
  };

  useEffect(
    () => () => {
      service.discardInspectedBackup(inspectedRef.current);
      inspectedRef.current = null;
    },
    [service],
  );

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
    setProgress(null);
  };

  const handleExport = async () => {
    clearFeedback();
    setOperation('backup');
    let created: Awaited<ReturnType<BackupService['createBackup']>> | null = null;
    try {
      created = await service.createBackup(setProgress);
      if (!(await confirmSkippedTracks(created.skippedTrackIds.length))) {
        setMessage(
          `Export annullato. ${created.skippedTrackIds.length} brani senza file valido erano stati esclusi; nessun dato originale e stato modificato.`,
        );
        return;
      }
      const shareResult = await Share.share(
        {
          title: created.fileName,
          url: created.archiveUri,
        },
        { subject: created.fileName },
      );
      const skipped = created.skippedTrackIds.length;
      if (shareResult.action === Share.dismissedAction) {
        setMessage(
          `Condivisione annullata. Backup temporaneo eliminato; nessun dato originale e stato modificato.${
            skipped > 0 ? ` ${skipped} brani senza file erano stati esclusi.` : ''
          }`,
        );
      } else {
        setMessage(
          `${created.manifest.trackCount} brani e ${created.manifest.playlistCount} playlist preparati. ${
            skipped > 0 ? `${skipped} brani senza file esclusi. ` : ''
          }Salva ${created.fileName} in Files/iCloud/AirDrop per conservarlo fuori da AuraMusic.`,
        );
      }
    } catch (exportError) {
      console.error('AuraMusic backup export failed', exportError);
      setError(getUserFacingError(exportError));
    } finally {
      service.deleteCreatedBackup(created);
      setOperation('idle');
      setProgress(null);
    }
  };

  const handlePickRestore = async () => {
    clearFeedback();
    setOperation('inspect');
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false, mimeTypes: '*/*' });
      if (picked.canceled) {
        setMessage('Selezione backup annullata.');
        return;
      }
      const extension = picked.result.extension.toLowerCase();
      if (extension !== '.aurabackup' && extension !== '.zip') {
        throw new Error('Seleziona un file .aurabackup o .zip creato da AuraMusic.');
      }
      const nextInspected = await service.inspectBackup(picked.result.uri, setProgress);
      storeInspectedBackup(nextInspected);
    } catch (inspectError) {
      console.error('AuraMusic backup inspection failed', inspectError);
      setError(getUserFacingError(inspectError));
    } finally {
      setOperation('idle');
      setProgress(null);
    }
  };

  const cancelRestore = () => {
    service.discardInspectedBackup(inspected);
    storeInspectedBackup(null);
  };

  const performRestore = async () => {
    if (!inspected) return;
    clearFeedback();
    setOperation('restore');
    try {
      clearPlayback();
      const result = await service.restoreBackup(inspected, setProgress);
      storeInspectedBackup(null);
      await Promise.all([refreshTracks(), refreshPlaylists()]);
      setMessage(
        `Restore completato: ${result.trackCount} brani, ${result.playlistCount} playlist e ${result.membershipCount} relazioni.`,
      );
    } catch (restoreError) {
      console.error('AuraMusic backup restore failed', restoreError);
      service.discardInspectedBackup(inspected);
      storeInspectedBackup(null);
      setError(getUserFacingError(restoreError));
    } finally {
      setOperation('idle');
      setProgress(null);
    }
  };

  const confirmRestore = () => {
    if (isBusy) return;
    Alert.alert(
      'Replace current library?',
      'Il restore sostituira tutti i brani, le playlist e i file musicali attuali. Il backup e gia stato validato.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace & Restore', style: 'destructive', onPress: () => void performRestore() },
      ],
    );
  };

  return (
    <AuraScreen
      title="Settings"
      subtitle="Esporta una copia portabile o ripristina la Library da Files.">
      <View style={styles.dataCard}>
        <Text style={styles.sectionLabel}>DATA</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{tracks.length}</Text>
            <Text style={styles.summaryLabel}>tracks</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{playlists.length}</Text>
            <Text style={styles.summaryLabel}>playlists</Text>
          </View>
          {libraryBytes !== null && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatBytes(libraryBytes)}</Text>
              <Text style={styles.summaryLabel}>audio locale</Text>
            </View>
          )}
        </View>

        <AuraButton
          disabled={isBusy || nativeUnavailable}
          label="Export Backup"
          loading={operation === 'backup'}
          onPress={() => void handleExport()}
        />
        <AuraButton
          disabled={isBusy || nativeUnavailable}
          label="Restore Backup"
          loading={operation === 'inspect'}
          onPress={() => void handlePickRestore()}
          variant="secondary"
        />
        <Text style={styles.hint}>
          {nativeUnavailable
            ? 'Backup e restore richiedono la build iOS nativa; su questa piattaforma restano disabilitati.'
            : 'Export apre il pannello iOS: scegli Save to Files, iCloud Drive o AirDrop. Il file temporaneo interno viene poi eliminato.'}
        </Text>
      </View>

      {isBusy && (
        <View style={styles.progressCard}>
          <ActivityIndicator color={AuraColors.primary} />
          <Text style={styles.progressText}>{progressLabel(progress) ?? 'Operazione in corso…'}</Text>
        </View>
      )}
      {message && <Text style={styles.success}>{message}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!isBusy) cancelRestore();
        }}
        transparent
        visible={inspected !== null}>
        <View style={styles.modalBackdrop}>
          {inspected && (
            <View style={styles.modalCard}>
              <Text style={styles.modalEyebrow}>AURAMUSIC BACKUP</Text>
              <Text style={styles.modalTitle}>Backup validato</Text>
              <View style={styles.details}>
                <Text style={styles.detailText}>
                  Created: {new Date(inspected.manifest.createdAt).toLocaleString('it-IT')}
                </Text>
                <Text style={styles.detailText}>Tracks: {inspected.manifest.trackCount}</Text>
                <Text style={styles.detailText}>Playlists: {inspected.manifest.playlistCount}</Text>
                <Text style={styles.detailText}>Audio: {formatBytes(inspected.manifest.totalAudioBytes)}</Text>
                <Text style={styles.detailText}>Backup version: {inspected.manifest.version}</Text>
              </View>
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  Restoring this backup will replace your current AuraMusic library.
                </Text>
              </View>
              <AuraButton
                disabled={isBusy}
                label="Restore Library"
                loading={operation === 'restore'}
                onPress={confirmRestore}
              />
              <AuraButton
                disabled={isBusy}
                label="Cancel"
                onPress={cancelRestore}
                variant="secondary"
              />
            </View>
          )}
        </View>
      </Modal>
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  dataCard: {
    gap: 14,
    padding: 20,
    borderRadius: 22,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  sectionLabel: { color: AuraColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { minWidth: 82, flexGrow: 1, padding: 12, borderRadius: 15, backgroundColor: AuraColors.background },
  summaryValue: { color: AuraColors.text, fontSize: 17, fontWeight: '900' },
  summaryLabel: { color: AuraColors.textMuted, fontSize: 11, marginTop: 3 },
  hint: { color: AuraColors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 16, borderRadius: 17, backgroundColor: AuraColors.surfaceRaised },
  progressText: { flex: 1, color: AuraColors.text, fontSize: 13 },
  success: { color: AuraColors.success, fontSize: 13, lineHeight: 19, marginTop: 18, textAlign: 'center' },
  error: { color: AuraColors.danger, fontSize: 13, lineHeight: 19, marginTop: 18, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.78)' },
  modalCard: { gap: 14, padding: 22, borderRadius: 24, backgroundColor: AuraColors.surface, borderColor: AuraColors.border, borderWidth: 1 },
  modalEyebrow: { color: AuraColors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  modalTitle: { color: AuraColors.text, fontSize: 24, fontWeight: '900' },
  details: { gap: 7, padding: 15, borderRadius: 16, backgroundColor: AuraColors.background },
  detailText: { color: AuraColors.textMuted, fontSize: 13 },
  warningBox: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: AuraColors.danger, backgroundColor: '#281820' },
  warningText: { color: AuraColors.danger, fontSize: 13, fontWeight: '700', lineHeight: 19 },
});
