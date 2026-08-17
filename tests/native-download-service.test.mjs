import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapYouTubeInfoToDownloadInfo,
  NativeDownloadService,
} from '../src/services/native-download-service-core.ts';

const nativeInfo = {
  id: 'video_123',
  title: 'Test video',
  uploader: 'Test channel',
  duration: 123,
  thumbnail: 'https://example.com/thumbnail.jpg',
  webpageUrl: 'https://www.youtube.com/watch?v=video_123',
  hasM4aAudio: true,
  preferredM4aFormatId: '140',
};

function createNativeAdapter({ failDownload = false } = {}) {
  const listeners = new Set();
  let downloadCalls = 0;
  return {
    adapter: {
      async extractYouTubeInfo() {
        return nativeInfo;
      },
      async downloadYouTubeM4a() {
        downloadCalls += 1;
        if (failDownload) {
          throw Object.assign(new Error('Network unavailable'), { code: 'NETWORK_ERROR' });
        }
        for (const listener of listeners) {
          listener({
            status: 'downloading',
            downloadedBytes: 50,
            totalBytes: 100,
            totalBytesEstimate: null,
            speed: 10,
            eta: 5,
            progress: 0.5,
          });
        }
        return {
          success: true,
          alreadyExists: false,
          videoId: nativeInfo.id,
          title: nativeInfo.title,
          formatId: '140',
          ext: 'm4a',
          localPath: `/documents/music/${nativeInfo.id}.m4a`,
          localUri: `file:///documents/music/${nativeInfo.id}.m4a`,
          fileSize: 100,
        };
      },
      addDownloadProgressListener(listener) {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      },
    },
    getDownloadCalls: () => downloadCalls,
  };
}

test('maps YouTube metadata to persistent Track metadata', () => {
  assert.deepEqual(
    mapYouTubeInfoToDownloadInfo(nativeInfo, nativeInfo.webpageUrl),
    {
      id: 'video_123',
      title: 'Test video',
      artist: 'Test channel',
      thumbnail: 'https://example.com/thumbnail.jpg',
      duration: 123,
      sourceUrl: nativeInfo.webpageUrl,
      hasM4aAudio: true,
      preferredM4aFormatId: '140',
    },
  );
});

test('downloads through the mocked native module and builds Track after verification', async () => {
  const native = createNativeAdapter();
  const progress = [];
  const service = new NativeDownloadService(native.adapter, {
    async inspect() {
      return { status: 'missing', uri: '', size: null };
    },
    async verify(videoId) {
      return {
        status: 'valid',
        uri: `file:///documents/music/${videoId}.m4a`,
        size: 100,
      };
    },
    async delete() {},
  });

  const track = await service.downloadAudio(nativeInfo.webpageUrl, (event) => progress.push(event));
  assert.equal(track.id, nativeInfo.id);
  assert.equal(track.localUri, 'file:///documents/music/video_123.m4a');
  assert.equal(track.missingLocalFile, false);
  assert.equal(native.getDownloadCalls(), 1);
  assert.equal(progress[0].status, 'preparing');
  assert.equal(progress[1].progress, 0.5);
});

test('reuses an existing valid M4A without invoking the native download', async () => {
  const native = createNativeAdapter();
  const service = new NativeDownloadService(native.adapter, {
    async inspect(videoId) {
      return {
        status: 'valid',
        uri: `file:///documents/music/${videoId}.m4a`,
        size: 2048,
      };
    },
    async verify() {
      throw new Error('verify must not run for an existing file');
    },
    async delete() {},
  });

  const track = await service.downloadAudio(nativeInfo.webpageUrl);
  assert.equal(track.localUri, 'file:///documents/music/video_123.m4a');
  assert.equal(native.getDownloadCalls(), 0);
});

test('propagates a mocked native download error without creating a Track', async () => {
  const native = createNativeAdapter({ failDownload: true });
  const service = new NativeDownloadService(native.adapter, {
    async inspect() {
      return { status: 'missing', uri: '', size: null };
    },
    async verify() {
      throw new Error('verify must not run after failure');
    },
    async delete() {},
  });

  await assert.rejects(
    service.downloadAudio(nativeInfo.webpageUrl),
    (error) => error.code === 'NETWORK_ERROR',
  );
});
