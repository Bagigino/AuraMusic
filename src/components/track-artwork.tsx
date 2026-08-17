import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuraColors } from '@/constants/aura-theme';

type TrackArtworkProps = {
  size: number;
  thumbnail?: string;
};

export function TrackArtwork({ size, thumbnail = '' }: TrackArtworkProps) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);

  if (thumbnail && thumbnail !== failedThumbnail) {
    return (
      <Image
        contentFit="cover"
        onError={() => setFailedThumbnail(thumbnail)}
        source={{ uri: thumbnail }}
        style={{ width: size, height: size, borderRadius: size * 0.24 }}
        transition={160}
      />
    );
  }

  return (
    <View style={[styles.artwork, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <View
        style={[
          styles.orbit,
          {
            width: size * 0.68,
            height: size * 0.68,
            borderRadius: size,
          },
        ]}
      />
      <Text style={[styles.note, { fontSize: size * 0.34 }]}>♪</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#33255D',
    borderColor: '#6D5AA8',
    borderWidth: 1,
  },
  orbit: {
    position: 'absolute',
    borderColor: AuraColors.accent,
    borderWidth: 2,
    opacity: 0.34,
    transform: [{ rotate: '-18deg' }, { scaleY: 0.42 }],
  },
  note: {
    color: AuraColors.text,
    fontWeight: '700',
  },
});
