import type { YouTubeSearchResult } from './youtube-search-service';

export type YouTubeSearchStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error';

export type YouTubeSearchState = {
  status: YouTubeSearchStatus;
  query: string;
  results: YouTubeSearchResult[];
  error: string | null;
};

export type YouTubeSearchAction =
  | { type: 'QUERY_CHANGED'; query: string }
  | { type: 'SEARCH_STARTED' }
  | { type: 'SEARCH_SUCCEEDED'; results: YouTubeSearchResult[] }
  | { type: 'SEARCH_FAILED'; message: string };

export function createInitialYouTubeSearchState(): YouTubeSearchState {
  return {
    status: 'idle',
    query: '',
    results: [],
    error: null,
  };
}

export function youtubeSearchReducer(
  state: YouTubeSearchState,
  action: YouTubeSearchAction,
): YouTubeSearchState {
  switch (action.type) {
    case 'QUERY_CHANGED':
      return {
        status: 'idle',
        query: action.query,
        results: [],
        error: null,
      };
    case 'SEARCH_STARTED':
      return {
        ...state,
        status: 'searching',
        results: [],
        error: null,
      };
    case 'SEARCH_SUCCEEDED':
      return {
        ...state,
        status: action.results.length === 0 ? 'empty' : 'results',
        results: action.results,
        error: null,
      };
    case 'SEARCH_FAILED':
      return {
        ...state,
        status: 'error',
        results: [],
        error: action.message,
      };
  }
}
