import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSearchPlaybackQueue,
  getNextQueueIndex,
} from '../src/audio/playback-queue.ts';

import {
  canRefreshRemotePlayback,
  normalizeRemotePlaybackSource,
  refreshRemotePlayerSource,
  resolvePlayerSource,
  searchResultToPlayableTrack,
} from '../src/services/playback-source-service.ts';

const searchResult = {
  id: 'dQw4w9WgXcQ',
  title: 'Remote song',
  uploader: 'Remote artist',
  duration: 200,
  thumbnail: 'https://example.com/cover.jpg',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

const localTrack = {
  id: searchResult.id,
  title: searchResult.title,
  artist: searchResult.uploader,
  duration: searchResult.duration,
  thumbnail: searchResult.thumbnail,
  sourceUrl: searchResult.url,
  localUri: 'file:///documents/music/dQw4w9WgXcQ.m4a',
  downloadedAt: '2026-08-17T10:00:00.000Z',
  missingLocalFile: false,
};

test('SearchResult resolves a remote source without downloading', async () => {
  const calls = [];
  const source = await resolvePlayerSource(searchResultToPlayableTrack(searchResult), [], {
    async resolveYouTubePlaybackSource(url) {
      calls.push(url);
      return {
        videoId: searchResult.id,
        title: searchResult.title,
        artist: searchResult.uploader,
        thumbnail: searchResult.thumbnail,
        duration: searchResult.duration,
        remoteUri: 'https://rr.example.googlevideo.com/audio',
        formatId: '140',
        ext: 'm4a',
        headers: { 'User-Agent': 'yt-dlp-agent' },
      };
    },
  });
  assert.equal(source.type, 'remote');
  assert.equal(source.uri, 'https://rr.example.googlevideo.com/audio');
  assert.deepEqual(source.headers, { 'User-Agent': 'yt-dlp-agent' });
  assert.deepEqual(calls, [searchResult.url]);
});

test('Library localUri is preferred and native resolution is skipped', async () => {
  const source = await resolvePlayerSource(
    searchResultToPlayableTrack(searchResult),
    [localTrack],
    {
      async resolveYouTubePlaybackSource() {
        throw new Error('remote resolver must not run');
      },
    },
  );
  assert.deepEqual(source, { type: 'local', track: localTrack, uri: localTrack.localUri });
});

test('Next queue item resolves localUri when saved and remoteUri otherwise', async () => {
  const nextResult = {
    ...searchResult,
    id: 'next-video',
    title: 'Next song',
    url: 'https://www.youtube.com/watch?v=next-video',
  };
  const queue = createSearchPlaybackQueue([searchResult, nextResult], searchResult.id);
  const nextIndex = getNextQueueIndex(queue);
  assert.notEqual(nextIndex, null);
  const nextItem = queue.tracks[nextIndex];
  const savedNext = {
    ...localTrack,
    id: nextResult.id,
    title: nextResult.title,
    sourceUrl: nextResult.url,
    localUri: 'file:///documents/music/next-video.m4a',
  };

  const localSource = await resolvePlayerSource(nextItem, [savedNext], {
    async resolveYouTubePlaybackSource() {
      throw new Error('remote resolver must not run for the saved next Track');
    },
  });
  assert.equal(localSource.type, 'local');
  assert.equal(localSource.uri, savedNext.localUri);

  const remoteSource = await resolvePlayerSource(nextItem, [], {
    async resolveYouTubePlaybackSource(url) {
      assert.equal(url, nextResult.url);
      return {
        videoId: nextResult.id,
        title: nextResult.title,
        artist: nextResult.uploader,
        thumbnail: nextResult.thumbnail,
        duration: nextResult.duration,
        remoteUri: 'https://media.example/next-video.m4a',
        formatId: '140',
        ext: 'm4a',
      };
    },
  });
  assert.equal(remoteSource.type, 'remote');
  assert.equal(remoteSource.uri, 'https://media.example/next-video.m4a');
});

test('a missing local file falls back to the remote source', async () => {
  const source = await resolvePlayerSource(
    searchResultToPlayableTrack(searchResult),
    [{ ...localTrack, missingLocalFile: true }],
    {
      async resolveYouTubePlaybackSource() {
        return {
          videoId: searchResult.id,
          title: searchResult.title,
          artist: null,
          thumbnail: null,
          duration: null,
          remoteUri: 'https://media.example/audio.m4a',
          formatId: '140',
          ext: 'm4a',
        };
      },
    },
  );
  assert.equal(source.type, 'remote');
});

test('remote source refresh is allowed exactly once', () => {
  const remoteSource = {
    type: 'remote',
    video: searchResultToPlayableTrack(searchResult),
    uri: 'https://media.example/audio.m4a',
    formatId: '140',
    ext: 'm4a',
  };
  assert.equal(canRefreshRemotePlayback(remoteSource, 0), true);
  assert.equal(canRefreshRemotePlayback(remoteSource, 1), false);
  assert.equal(canRefreshRemotePlayback({ type: 'local', track: localTrack, uri: localTrack.localUri }, 0), false);
});

test('expired remote playback resolves one fresh URL and refuses a second refresh', async () => {
  const calls = [];
  const remoteSource = {
    type: 'remote',
    video: searchResultToPlayableTrack(searchResult),
    uri: 'https://media.example/expired.m4a',
    formatId: '140',
    ext: 'm4a',
  };
  const service = {
    async resolveYouTubePlaybackSource(url) {
      calls.push(url);
      return {
        videoId: searchResult.id,
        title: searchResult.title,
        artist: searchResult.uploader,
        thumbnail: searchResult.thumbnail,
        duration: searchResult.duration,
        remoteUri: 'https://media.example/fresh.m4a',
        formatId: '140',
        ext: 'm4a',
      };
    },
  };
  const refreshed = await refreshRemotePlayerSource(remoteSource, 0, service);
  assert.equal(refreshed.uri, 'https://media.example/fresh.m4a');
  assert.equal(await refreshRemotePlayerSource(refreshed, 1, service), null);
  assert.deepEqual(calls, [searchResult.url]);
});

test('native playback DTO retains yt-dlp headers but rejects invalid media URIs', () => {
  assert.deepEqual(
    normalizeRemotePlaybackSource({
      videoId: searchResult.id,
      title: searchResult.title,
      remoteUri: 'https://media.example/audio.m4a?expire=123',
      formatId: '140',
      headers: {
        Referer: 'https://www.youtube.com/',
        Cookie: 'must-not-cross-the-bridge',
      },
    }).headers,
    { Referer: 'https://www.youtube.com/' },
  );
  assert.throws(
    () => normalizeRemotePlaybackSource({ videoId: 'x', title: 'x', remoteUri: 'file:///x', formatId: '140' }),
    (error) => error.code === 'INVALID_PLAYBACK_URI',
  );
});
