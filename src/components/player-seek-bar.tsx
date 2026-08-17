import { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  beginScrubbing,
  commitSeekPosition,
  finishScrubbing,
  getRelativeSeekPosition,
  getSeekDisplayPosition,
  idleSeekScrubState,
  seekPositionFromOffset,
  updateScrubbing,
  type SeekScrubState,
} from '@/audio/seek-controller';
import { AuraColors } from '@/constants/aura-theme';
import { formatDuration } from '@/utils/format-duration';

type PlayerSeekBarProps = {
  currentTime: number;
  duration: number;
  disabled?: boolean;
  onSeek: (position: number) => void | Promise<void>;
};

export function PlayerSeekBar({
  currentTime,
  duration,
  disabled = false,
  onSeek,
}: PlayerSeekBarProps) {
  const [scrubState, setScrubState] = useState<SeekScrubState>(idleSeekScrubState);
  const scrubStateRef = useRef<SeekScrubState>(idleSeekScrubState);
  const trackWidthRef = useRef(0);
  const trackPageXRef = useRef(0);
  const enabled = !disabled && Number.isFinite(duration) && duration > 0;

  const updateState = (nextState: SeekScrubState) => {
    scrubStateRef.current = nextState;
    setScrubState(nextState);
  };

  const previewOffset = (offset: number, start: boolean) => {
    const position = seekPositionFromOffset(offset, trackWidthRef.current, duration);
    if (position === null) {
      return;
    }
    updateState(
      start
        ? beginScrubbing(position, duration)
        : updateScrubbing(scrubStateRef.current, position, duration),
    );
  };

  const updateFromEvent = (event: GestureResponderEvent) => {
    previewOffset(event.nativeEvent.pageX - trackPageXRef.current, false);
  };

  const commitScrub = (event: GestureResponderEvent) => {
    updateFromEvent(event);
    const target = finishScrubbing(scrubStateRef.current, duration);
    updateState(idleSeekScrubState);
    if (target !== null) {
      void commitSeekPosition(target, duration, onSeek).catch((error: unknown) => {
        console.error('AuraMusic seek failed', error);
      });
    }
  };

  const displayPosition = getSeekDisplayPosition(currentTime, scrubState, duration);
  const progress = duration > 0 ? displayPosition / duration : 0;

  const handleAccessibilityAction = (direction: number) => {
    const target = getRelativeSeekPosition(displayPosition, direction, duration);
    if (target !== null) {
      void commitSeekPosition(target, duration, onSeek).catch((error: unknown) => {
        console.error('AuraMusic accessible seek failed', error);
      });
    }
  };

  return (
    <View style={styles.timeline}>
      <View
        accessibilityActions={[
          { name: 'increment', label: 'Avanti di 15 secondi' },
          { name: 'decrement', label: 'Indietro di 15 secondi' },
        ]}
        accessibilityHint="Tocca o trascina per cambiare posizione"
        accessibilityLabel="Posizione nel brano"
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !enabled }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            handleAccessibilityAction(15);
          } else if (event.nativeEvent.actionName === 'decrement') {
            handleAccessibilityAction(-15);
          }
        }}
        onLayout={(event) => {
          trackWidthRef.current = event.nativeEvent.layout.width;
        }}
        onMoveShouldSetResponder={() => enabled}
        onResponderGrant={(event) => {
          const locationX = event.nativeEvent.locationX;
          trackPageXRef.current = event.nativeEvent.pageX - locationX;
          previewOffset(locationX, true);
        }}
        onResponderMove={updateFromEvent}
        onResponderRelease={commitScrub}
        onResponderTerminate={commitScrub}
        onResponderTerminationRequest={() => false}
        onStartShouldSetResponder={() => enabled}
        style={[styles.touchTrack, !enabled && styles.disabled]}
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatDuration(displayPosition)}</Text>
        <Text style={styles.time}>{formatDuration(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { width: '100%', marginTop: 34 },
  touchTrack: { width: '100%', height: 32, justifyContent: 'center' },
  progressTrack: {
    width: '100%',
    height: 6,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: AuraColors.surfaceRaised,
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: AuraColors.primary },
  thumb: {
    position: 'absolute',
    top: 8,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: AuraColors.primary,
    borderColor: AuraColors.text,
    borderWidth: 2,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  time: { color: AuraColors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.45 },
});
