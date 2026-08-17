import { useReducer, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuraButton } from '@/components/aura-button';
import { AuraScreen } from '@/components/aura-screen';
import { TrackArtwork } from '@/components/track-artwork';
import { AuraColors } from '@/constants/aura-theme';
import { useAppAudioPlayer } from '@/audio/audio-player-context';
import { useTrackLibrary } from '@/library/track-library-context';
import { appYouTubeSearchService } from '@/services/app-youtube-search-service';
import {
  isSearchResultInLibrary,
  MAX_YOUTUBE_SEARCH_QUERY_LENGTH,
  type YouTubeSearchResult,
} from '@/services/youtube-search-service';
import {
  createInitialYouTubeSearchState,
  youtubeSearchReducer,
} from '@/services/youtube-search-state';
import { formatDuration } from '@/utils/format-duration';

function getSearchErrorMessage(error: unknown) {
  const searchError = error as { code?: unknown; message?: unknown };
  const code = typeof searchError?.code === 'string' ? searchError.code : null;
  const messages: Record<string, string> = {
    EMPTY_SEARCH_QUERY: 'Inserisci almeno un termine da cercare.',
    SEARCH_QUERY_TOO_LONG: 'La ricerca non puo superare 200 caratteri.',
    NETWORK_ERROR: 'YouTube non e raggiungibile. Controlla la connessione.',
    NETWORK_TIMEOUT: 'La ricerca YouTube ha superato il timeout.',
    TLS_ERROR: 'La connessione sicura a YouTube non e riuscita.',
    APPLE_PROVIDER_UNAVAILABLE: 'Il provider Apple WebKit non e disponibile.',
    EXTRACTOR_ERROR: 'yt-dlp non e riuscito a completare la ricerca.',
    INVALID_SEARCH_RESPONSE: 'YouTube ha restituito risultati non validi.',
    INVALID_NATIVE_RESPONSE: 'Il modulo nativo ha restituito risultati non validi.',
    PYTHON_ERROR: 'Il runtime Python non ha completato la ricerca.',
    SEARCH_UNAVAILABLE: 'La ricerca YouTube nativa non e disponibile sul web.',
  };
  if (code && messages[code]) {
    return messages[code];
  }
  return typeof searchError?.message === 'string'
    ? searchError.message
    : 'La ricerca YouTube non e riuscita.';
}

export default function SearchScreen() {
  const { tracks } = useTrackLibrary();
  const { playSearchResult } = useAppAudioPlayer();
  const [state, dispatch] = useReducer(
    youtubeSearchReducer,
    undefined,
    createInitialYouTubeSearchState,
  );
  const searchInFlight = useRef(false);

  const handleSearch = async () => {
    if (searchInFlight.current) {
      return;
    }
    searchInFlight.current = true;
    dispatch({ type: 'SEARCH_STARTED' });
    try {
      const results = await appYouTubeSearchService.search(state.query, 10);
      dispatch({ type: 'SEARCH_SUCCEEDED', results });
    } catch (error) {
      console.error('AuraMusic YouTube search failed', error);
      dispatch({ type: 'SEARCH_FAILED', message: getSearchErrorMessage(error) });
    } finally {
      searchInFlight.current = false;
    }
  };

  const selectResult = (result: YouTubeSearchResult) => {
    playSearchResult(result, state.results);
  };

  return (
    <AuraScreen
      title="Search"
      subtitle={
        Platform.OS === 'web'
          ? 'La versione web usa una sorgente streaming di prova locale.'
          : 'Cerca un brano YouTube e toccalo per ascoltarlo subito in streaming.'
      }>
      <View style={styles.searchCard}>
        <Text style={styles.inputLabel}>YOUTUBE SEARCH</Text>
        <TextInput
          accessibilityLabel="YouTube search query"
          autoCapitalize="none"
          autoCorrect={false}
          editable={state.status !== 'searching'}
          maxLength={MAX_YOUTUBE_SEARCH_QUERY_LENGTH}
          onChangeText={(query) => dispatch({ type: 'QUERY_CHANGED', query })}
          onSubmitEditing={() => void handleSearch()}
          placeholder="Daft Punk Get Lucky"
          placeholderTextColor={AuraColors.textMuted}
          returnKeyType="search"
          style={styles.input}
          value={state.query}
        />
        <AuraButton
          disabled={!state.query.trim()}
          label="Search"
          loading={state.status === 'searching'}
          onPress={() => void handleSearch()}
        />
      </View>

      {state.status === 'idle' && (
        <Text style={styles.helper}>La ricerca parte solo quando premi Search.</Text>
      )}

      {state.status === 'empty' && (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Nessun video trovato</Text>
          <Text style={styles.stateText}>Prova a modificare i termini della ricerca.</Text>
        </View>
      )}

      {state.status === 'error' && state.error && (
        <View style={styles.stateCard}>
          <Text style={styles.error}>{state.error}</Text>
        </View>
      )}

      {state.status === 'results' && (
        <View style={styles.results}>
          <Text style={styles.sectionLabel}>{state.results.length} RISULTATI</Text>
          {state.results.map((result) => {
            const isInLibrary = isSearchResultInLibrary(result, tracks);
            return (
              <Pressable
                accessibilityHint="Avvia lo streaming e mostra il Mini Player"
                accessibilityRole="button"
                key={result.id}
                onPress={() => selectResult(result)}
                style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}>
                <TrackArtwork size={76} thumbnail={result.thumbnail ?? ''} />
                <View style={styles.resultInfo}>
                  <Text numberOfLines={2} style={styles.resultTitle}>
                    {result.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.resultUploader}>
                    {result.uploader ?? 'Uploader non disponibile'}
                  </Text>
                  <View style={styles.metadataRow}>
                    <Text style={styles.duration}>
                      {result.duration === null
                        ? 'Durata non disponibile'
                        : formatDuration(result.duration)}
                    </Text>
                    {isInLibrary && (
                      <Text style={styles.libraryBadge}>ALREADY IN YOUR LIBRARY</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </AuraScreen>
  );
}

const styles = StyleSheet.create({
  searchCard: {
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
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderColor: AuraColors.border,
    borderWidth: 1,
    backgroundColor: AuraColors.background,
    color: AuraColors.text,
    fontSize: 15,
  },
  helper: {
    color: AuraColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
    textAlign: 'center',
  },
  stateCard: {
    gap: 6,
    marginTop: 18,
    padding: 20,
    borderRadius: 20,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  stateTitle: {
    color: AuraColors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    color: AuraColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  error: {
    color: AuraColors.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  results: {
    gap: 12,
    marginTop: 24,
  },
  sectionLabel: {
    color: AuraColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 13,
    borderRadius: 20,
    backgroundColor: AuraColors.surface,
    borderColor: AuraColors.border,
    borderWidth: 1,
  },
  resultInfo: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    color: AuraColors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  resultUploader: {
    color: AuraColors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  metadataRow: {
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 8,
  },
  duration: {
    color: AuraColors.textMuted,
    fontSize: 11,
  },
  libraryBadge: {
    color: AuraColors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  chevron: {
    color: AuraColors.primary,
    fontSize: 28,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
});
