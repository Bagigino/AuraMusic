# YouTube M4A download POC

This proof of concept is isolated in the `AuraNativeTest` debug module. It does not
write to SQLite, add a track to Library, or change the application's mock
`DownloadService`.

## Native API and destination

`downloadYouTubeM4a(url, formatId?)` is an asynchronous Expo Module function. Swift
obtains the application Documents directory with `FileManager`, creates
`Documents/music-downloads`, and passes that internal path to the existing embedded
CPython interpreter. JavaScript cannot provide a filesystem destination.

The only output template is:

```text
%(id)s.%(ext)s
```

The expected final path is therefore:

```text
Documents/music-downloads/<videoId>.m4a
```

Swift resolves and validates the returned path, verifies that it is a regular file
inside `music-downloads`, checks that its size is greater than zero, and creates a
percent-encoded `file://` URL with `URL.absoluteString` for `expo-audio`.

## Format selection and yt-dlp options

The helper first extracts metadata with `download=False`. A valid source format must
have `vcodec == "none"`, a real audio codec, and `ext == "m4a"`. A supplied format ID
must match one of those formats exactly. Without an ID, the highest `abr` wins, with
file size and format ID used only as deterministic tie-breakers.

The actual download uses yt-dlp's embedded `YoutubeDL.extract_info(url,
download=True)` API with the selected exact format ID. Relevant options are:

- `noplaylist: True`
- `paths.home: Documents/music-downloads`
- `outtmpl.default: %(id)s.%(ext)s`
- `socket_timeout: 25`
- `cachedir: False`
- `continuedl: False`
- `nopart: False`
- `fixup: "never"`
- metadata, thumbnail, subtitle, and automatic-subtitle file writes disabled;
  comment extraction is also disabled
- a `progress_hooks` callback

No postprocessor is configured. `fixup: "never"` also prevents yt-dlp from invoking
an automatic FFmpeg fixup. FFmpeg, conversion, transcoding, remuxing, QuickJS, Deno,
Node, and additional native dependencies are not added by this POC.

## Progress and incomplete files

The Python progress hook emits only sanitized numeric progress fields. The
Objective-C bridge forwards the JSON payload to Swift, which emits the Expo event
`onDownloadProgress`. The TypeScript debug card subscribes to that event and shows
Preparing, Downloading (including a percentage when a total is known), and
Completed.

Before a new download, and after a failed one, cleanup is limited to regular files
whose names start with `<videoId>.m4a.part` or `<videoId>.m4a.ytdl`. A completed M4A
is never deleted. If a nonempty completed file already exists, the network download
is skipped and `alreadyExists: true` is returned.

## Debug playback and web behavior

The debug card keeps the result in React state for the test session. `Play downloaded
M4A` sends an ephemeral, non-persisted Track value to the existing `expo-audio`
player using only the returned local URI, then opens the Player screen. This permits
the airplane-mode playback test without modifying Library or SQLite.

On web, the API returns `Native M4A download unavailable on web` and the progress
listener is a no-op. CPython and yt-dlp are never invoked by the web fallback.

Native cancellation is intentionally postponed. The current embedded call is
synchronous while it owns the CPython GIL, and adding a reliable cancellation path
would require cross-thread state and yt-dlp interruption semantics beyond this
minimal proof of concept. The UI and native module permit only one active download.
