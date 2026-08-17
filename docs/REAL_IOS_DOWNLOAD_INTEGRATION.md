# Real iOS download integration

## Architecture

The production flow keeps platform and UI concerns separate:

```text
Add Track UI
  -> TrackLibraryProvider
  -> DownloadService
  -> NativeDownloadService (iOS only)
  -> AuraNativeTest Expo Module
  -> Swift / embedded CPython / yt-dlp / Apple WebKit provider
```

Metro selects `app-download-service.ios.ts` for an iOS native build and the mock
implementation for web and other platforms. The main UI does not import the Expo
native module. The separate Debug card is intentionally retained for diagnostics.

## Add Track state machine

The screen uses one reducer with these mutually exclusive states:

```text
idle -> analyzing -> ready -> downloading -> saving -> completed
                 \                              /
                  +---------- error <----------+
```

Analyze retrieves real metadata and checks SQLite by the stable YouTube video ID.
Download is enabled only when yt-dlp reports a preferred direct M4A audio-only
format and the Track is not already in Library. Progress events expose phase,
percentage when known, downloaded bytes, and known or estimated total bytes.

## Track and persistence

Only after the native result has been validated as a nonempty
`Documents/music/<videoId>.m4a` file does the service construct the Track:

```text
id, title, artist, thumbnail, duration,
sourceUrl, localUri, downloadedAt
```

`missingLocalFile` is derived at Library load time and is deliberately not stored.
The existing SQLite v1 `tracks` table remains unchanged:

```text
id, title, artist, thumbnail, duration,
source_url, local_uri, downloaded_at
```

The ordering is download -> verify file -> construct Track -> SQLite insert. If the
insert fails, the verified M4A is retained for recovery and the Library record is
not created.

## Duplicates and recovery

- A SQLite row with the same YouTube video ID blocks a second download.
- A missing file for an existing row is shown as `FILE MANCANTE`; the row is kept
  and playback is disabled.
- A nonempty canonical M4A with no SQLite row is reused after successful metadata
  analysis; no second native media download occurs and the Track is reconstructed.
- A zero-byte canonical file produces an explicit diagnostic error and is not
  treated as a valid download.

## Managed storage and deletion

The only canonical native media directory is `Documents/music`. Swift migrates
valid nonempty `.m4a` files from the old POC directory `Documents/music-downloads`
without overwriting existing canonical files.

Deletion first removes the SQLite row and then removes the local M4A. The storage
layer rejects any path that is not a direct `.m4a` child of the canonical managed
directory. If file deletion fails after the database operation, the Library stays
removed and reports that an orphan file may remain.

## Playback and offline behavior

Library and Player pass only `Track.localUri` to `expo-audio`; neither layer uses
the YouTube URL for streaming. Thumbnails may use their remote URL and fall back to
a placeholder offline, independently of audio playback.

## Explicit exclusions

There is no FFmpeg, conversion, transcoding, text search, playlist handling,
background download, concurrent queue, offline thumbnail storage, QuickJS, Deno,
or embedded Node.js in this integration.
