export const DEFAULT_YOUTUBE_SEARCH_LIMIT = 10;
export const MAX_YOUTUBE_SEARCH_LIMIT = 20;
export const MAX_YOUTUBE_SEARCH_QUERY_LENGTH = 200;

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const BLOCKED_RESULT_KINDS = ['channel', 'playlist', 'tab'];

export type YouTubeSearchResult = {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  url: string;
};

export interface YouTubeSearchService {
  search(query: string, limit?: number): Promise<YouTubeSearchResult[]>;
}

export type NativeYouTubeSearchAdapter = {
  searchYouTube(query: string, limit?: number): Promise<unknown | string>;
};

export class YouTubeSearchServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'YouTubeSearchServiceError';
    this.code = code;
  }
}

export function validateSearchQuery(rawQuery: string) {
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  if (!query) {
    throw new YouTubeSearchServiceError(
      'EMPTY_SEARCH_QUERY',
      'Inserisci almeno un termine da cercare.',
    );
  }
  if (query.length > MAX_YOUTUBE_SEARCH_QUERY_LENGTH) {
    throw new YouTubeSearchServiceError(
      'SEARCH_QUERY_TOO_LONG',
      `La ricerca non puo superare ${MAX_YOUTUBE_SEARCH_QUERY_LENGTH} caratteri.`,
    );
  }
  return query;
}

export function normalizeSearchLimit(limit = DEFAULT_YOUTUBE_SEARCH_LIMIT) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_YOUTUBE_SEARCH_LIMIT;
  }
  return Math.min(MAX_YOUTUBE_SEARCH_LIMIT, Math.max(1, Math.floor(limit)));
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function mapRawSearchResult(rawResult: unknown): YouTubeSearchResult | null {
  if (!rawResult || typeof rawResult !== 'object') {
    return null;
  }

  const raw = rawResult as Record<string, unknown>;
  const resultType = (
    optionalString(raw._type) ??
    optionalString(raw.type) ??
    'video'
  ).toLowerCase();
  const extractor = [
    optionalString(raw.ie_key),
    optionalString(raw.ieKey),
    optionalString(raw.extractor_key),
    optionalString(raw.extractorKey),
  ]
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLowerCase();

  if (
    !['url', 'video'].includes(resultType) ||
    BLOCKED_RESULT_KINDS.some((kind) => extractor.includes(kind))
  ) {
    return null;
  }

  const id = optionalString(raw.id);
  const title = optionalString(raw.title);
  if (!id || !YOUTUBE_VIDEO_ID_PATTERN.test(id) || !title) {
    return null;
  }

  return {
    id,
    title,
    uploader: optionalString(raw.uploader) ?? optionalString(raw.channel),
    duration: optionalDuration(raw.duration),
    thumbnail: optionalString(raw.thumbnail),
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

export function normalizeSearchResults(rawResults: unknown, limit = DEFAULT_YOUTUBE_SEARCH_LIMIT) {
  if (!Array.isArray(rawResults)) {
    throw new YouTubeSearchServiceError(
      'INVALID_SEARCH_RESPONSE',
      'La ricerca nativa ha restituito un risultato non valido.',
    );
  }

  const resolvedLimit = normalizeSearchLimit(limit);
  const seenIds = new Set<string>();
  const results: YouTubeSearchResult[] = [];
  for (const rawResult of rawResults) {
    const result = mapRawSearchResult(rawResult);
    if (!result || seenIds.has(result.id)) {
      continue;
    }
    seenIds.add(result.id);
    results.push(result);
    if (results.length >= resolvedLimit) {
      break;
    }
  }
  return results;
}

export function isSearchResultInLibrary(
  result: YouTubeSearchResult,
  tracks: readonly { id: string }[],
) {
  return tracks.some((track) => track.id === result.id);
}

export class NativeYouTubeSearchService implements YouTubeSearchService {
  private readonly nativeAdapter: NativeYouTubeSearchAdapter;

  constructor(nativeAdapter: NativeYouTubeSearchAdapter) {
    this.nativeAdapter = nativeAdapter;
  }

  async search(rawQuery: string, requestedLimit = DEFAULT_YOUTUBE_SEARCH_LIMIT) {
    const query = validateSearchQuery(rawQuery);
    const limit = normalizeSearchLimit(requestedLimit);
    const nativeResults = await this.nativeAdapter.searchYouTube(query, limit);
    if (typeof nativeResults === 'string') {
      throw new YouTubeSearchServiceError('SEARCH_UNAVAILABLE', nativeResults);
    }
    return normalizeSearchResults(nativeResults, limit);
  }
}

export class UnavailableYouTubeSearchService implements YouTubeSearchService {
  async search(rawQuery: string): Promise<YouTubeSearchResult[]> {
    validateSearchQuery(rawQuery);
    throw new YouTubeSearchServiceError(
      'SEARCH_UNAVAILABLE',
      'YouTube native search unavailable on web.',
    );
  }
}
