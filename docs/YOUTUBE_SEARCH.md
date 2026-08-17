# YouTube text search

## Flow and separation

The production search flow is:

```text
Search UI
  -> YouTubeSearchService
  -> AuraNativeTest Expo Module
  -> Swift / existing embedded CPython / yt-dlp
  -> volatile YouTubeSearchResult[]
  -> existing Add Track Analyze flow
```

Search is intentionally not part of `DownloadService`. It does not write SQLite,
Library, Documents, or media files. `AuraNativeTest` keeps its current name to
avoid a high-risk rename of the already validated pod, autolinking configuration,
workflow checks, and Debug API.

## Embedded yt-dlp call

`search_youtube_json(query, limit)` validates and collapses whitespace in the
query, clamps the requested limit to `1...20`, and calls:

```text
YoutubeDL(options).extract_info("ytsearch<limit>:<query>", download=False)
```

The default limit is 10. Options relevant to search are:

- `skip_download: True`
- `simulate: True`
- `extract_flat: "in_playlist"`
- `noplaylist: True`
- `playlistend: limit`
- `socket_timeout: 25`
- one network retry and one extractor retry
- cache and all metadata, thumbnail, and subtitle writes disabled
- the existing redacting diagnostic logger

No destination, output template, format, progress hook, postprocessor, FFmpeg, or
media-writing option is configured.

## Stable DTO and filtering

Each result contains only:

```text
id, title, uploader, duration, thumbnail, url
```

The Python layer rejects non-mappings, channel/playlist/tab extractors, non-video
entry types, missing titles, and IDs that are not valid 11-character YouTube video
IDs. The URL is always reconstructed as
`https://www.youtube.com/watch?v=<videoId>` rather than trusting an extractor URL.
The TypeScript service repeats the structural validation defensively, removes
duplicate IDs, and applies the requested result limit.

## UI behavior

The main tabs are Library, Search, and Player. Add Track remains a hidden route so
Search can send a selected watch URL into the existing Analyze, M4A availability,
duplicate detection, download progress, and SQLite flow. Search requests run only
on button press or keyboard submit, are disabled while active, and are never saved.

Web uses a controlled `YouTube native search unavailable on web` error and never
runs CPython or yt-dlp.
