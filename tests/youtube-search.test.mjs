import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSearchResultInLibrary,
  mapRawSearchResult,
  NativeYouTubeSearchService,
  normalizeSearchResults,
  validateSearchQuery,
} from '../src/services/youtube-search-service.ts';
import {
  createInitialYouTubeSearchState,
  youtubeSearchReducer,
} from '../src/services/youtube-search-state.ts';

const rawVideo = {
  _type: 'url',
  ie_key: 'Youtube',
  id: 'dQw4w9WgXcQ',
  title: 'Test video',
  uploader: 'Test channel',
  duration: 248,
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  url: 'https://untrusted.example/media',
};

const expectedResult = {
  id: rawVideo.id,
  title: rawVideo.title,
  uploader: rawVideo.uploader,
  duration: rawVideo.duration,
  thumbnail: rawVideo.thumbnail,
  url: `https://www.youtube.com/watch?v=${rawVideo.id}`,
};

test('validates and normalizes a submitted search query', () => {
  assert.equal(validateSearchQuery('  Daft   Punk Get Lucky  '), 'Daft Punk Get Lucky');
  assert.throws(() => validateSearchQuery('   '), (error) => error.code === 'EMPTY_SEARCH_QUERY');
  assert.throws(
    () => validateSearchQuery('x'.repeat(201)),
    (error) => error.code === 'SEARCH_QUERY_TOO_LONG',
  );
});

test('maps a flat yt-dlp video result and normalizes its URL', () => {
  assert.deepEqual(mapRawSearchResult(rawVideo), expectedResult);
});

test('filters channel, playlist, and entries without a valid video ID', () => {
  assert.equal(mapRawSearchResult({ ...rawVideo, ie_key: 'YoutubeTab' }), null);
  assert.equal(mapRawSearchResult({ ...rawVideo, _type: 'playlist' }), null);
  assert.equal(mapRawSearchResult({ ...rawVideo, id: undefined }), null);
  assert.equal(mapRawSearchResult({ ...rawVideo, id: 'not-a-youtube-id' }), null);
});

test('uses a mocked native search adapter, removes duplicates, and caps the limit', async () => {
  const calls = [];
  const service = new NativeYouTubeSearchService({
    async searchYouTube(query, limit) {
      calls.push({ query, limit });
      return [rawVideo, rawVideo, { ...rawVideo, _type: 'playlist' }];
    },
  });

  const results = await service.search('  Daft Punk  ', 99);
  assert.deepEqual(calls, [{ query: 'Daft Punk', limit: 20 }]);
  assert.deepEqual(results, [expectedResult]);
});

test('represents empty results and search failures with explicit states', () => {
  assert.deepEqual(normalizeSearchResults([]), []);

  let state = youtubeSearchReducer(createInitialYouTubeSearchState(), {
    type: 'QUERY_CHANGED',
    query: 'No result query',
  });
  state = youtubeSearchReducer(state, { type: 'SEARCH_STARTED' });
  assert.equal(state.status, 'searching');
  state = youtubeSearchReducer(state, { type: 'SEARCH_SUCCEEDED', results: [] });
  assert.equal(state.status, 'empty');
  state = youtubeSearchReducer(state, {
    type: 'SEARCH_FAILED',
    message: 'Network unavailable',
  });
  assert.equal(state.status, 'error');
  assert.equal(state.error, 'Network unavailable');
});

test('marks a search result already present in Library', () => {
  assert.equal(isSearchResultInLibrary(expectedResult, [{ id: expectedResult.id }]), true);
  assert.equal(isSearchResultInLibrary(expectedResult, [{ id: 'other-video' }]), false);
});

test('selection keeps the normalized video URL ready for Player resolution', () => {
  assert.equal(expectedResult.url, `https://www.youtube.com/watch?v=${expectedResult.id}`);
});
