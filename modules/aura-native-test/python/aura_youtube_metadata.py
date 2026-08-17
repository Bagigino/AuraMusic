"""YouTube search, metadata, and direct M4A support for embedded CPython."""

from __future__ import annotations

import errno
import json
import math
import os
import re
import socket
import sys
import time
import traceback
from collections.abc import Iterable, Mapping
from typing import Any
from urllib.parse import urlsplit

from aura_yt_dlp_apple_provider import (
    AuraYtDlpAppleProviderError,
    test_apple_webkit_provider,
)
from yt_dlp import YoutubeDL
from yt_dlp.networking.exceptions import (
    CertificateVerifyError,
    HTTPError,
    RequestError,
    TransportError,
)
from yt_dlp.utils import (
    DownloadCancelled,
    DownloadError,
    GeoRestrictedError,
    UnsupportedError,
)


_ALLOWED_HOSTS = frozenset(
    {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
)
_NETWORK_TIMEOUT_SECONDS = 25
_DOWNLOAD_RETRIES = 3
_EXTRACTOR_RETRIES = 2
_FRAGMENT_RETRIES = 3
_MEDIA_ACCESS_ATTEMPTS = 3
_MEDIA_ACCESS_RETRY_DELAY_SECONDS = 1.0
_DEFAULT_SEARCH_LIMIT = 10
_MAX_SEARCH_LIMIT = 20
_MAX_SEARCH_QUERY_LENGTH = 200
_MAX_DIAGNOSTIC_LOG_ENTRIES = 200
_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
_FORMAT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
_YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
_URL_PATTERN = re.compile(r"https?://[^\s\]\[<>()\"']+", re.IGNORECASE)
_SENSITIVE_PATTERN = re.compile(
    r"(?im)\b(authorization|cookie|set-cookie|x-goog-visitor-id|signature|sig|token)"
    r"\s*[:=]\s*[^\r\n]+"
)
_SENSITIVE_PLAYBACK_HEADERS = frozenset(
    {"authorization", "cookie", "proxy-authorization", "set-cookie"}
)


class AuraYouTubeExtractionError(RuntimeError):
    """Expected extraction failure with a stable code for the native bridge."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _redact_log_message(message: Any) -> str:
    """Keep diagnostics useful without logging media URLs or request secrets."""
    text = str(message).replace("\r", " ").strip()

    def redact_url(match: re.Match[str]) -> str:
        try:
            return urlsplit(match.group(0))._replace(
                path="/<redacted>", query="", fragment=""
            ).geturl()
        except ValueError:
            return "https://<redacted-url>"

    text = _URL_PATTERN.sub(redact_url, text)
    return _SENSITIVE_PATTERN.sub(r"\1=<redacted>", text)


class AuraYtDlpLogger:
    """yt-dlp's supported logger interface, routed to the iOS system log."""

    def __init__(self) -> None:
        self.entries: list[tuple[str, str]] = []

    def _write(self, level: str, message: Any) -> None:
        safe_message = _redact_log_message(message)
        self.entries.append((level, safe_message))
        del self.entries[:-_MAX_DIAGNOSTIC_LOG_ENTRIES]
        print(
            f"[AuraMusic][yt-dlp][{level}] {safe_message}",
            file=sys.stderr,
            flush=True,
        )

    def debug(self, message: Any) -> None:
        self._write("debug", message)

    def warning(self, message: Any) -> None:
        self._write("warning", message)

    def error(self, message: Any) -> None:
        self._write("error", message)


def _validate_url(raw_url: str) -> str:
    url = raw_url.strip()
    try:
        parsed = urlsplit(url)
    except ValueError as error:
        raise AuraYouTubeExtractionError(
            "INVALID_URL", "Inserisci un URL HTTPS YouTube valido."
        ) from error

    hostname = (parsed.hostname or "").lower()
    if (
        parsed.scheme.lower() != "https"
        or hostname not in _ALLOWED_HOSTS
        or not parsed.path
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise AuraYouTubeExtractionError(
            "INVALID_URL", "Inserisci un URL HTTPS appartenente a YouTube."
        )
    return url


def _validate_search_query(raw_query: str) -> str:
    if not isinstance(raw_query, str):
        raise AuraYouTubeExtractionError(
            "INVALID_SEARCH_QUERY", "Inserisci una ricerca YouTube valida."
        )
    query = " ".join(raw_query.split())
    if not query:
        raise AuraYouTubeExtractionError(
            "EMPTY_SEARCH_QUERY", "Inserisci almeno un termine da cercare."
        )
    if len(query) > _MAX_SEARCH_QUERY_LENGTH:
        raise AuraYouTubeExtractionError(
            "SEARCH_QUERY_TOO_LONG",
            f"La ricerca non puo superare {_MAX_SEARCH_QUERY_LENGTH} caratteri.",
        )
    return query


def _normalize_search_limit(raw_limit: Any) -> int:
    if isinstance(raw_limit, bool) or not isinstance(raw_limit, int):
        return _DEFAULT_SEARCH_LIMIT
    return min(_MAX_SEARCH_LIMIT, max(1, raw_limit))


def _nullable_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _nullable_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _search_thumbnail(entry: Mapping[str, Any]) -> str | None:
    thumbnail = _nullable_string(entry.get("thumbnail"))
    if thumbnail is not None:
        return thumbnail

    thumbnails = entry.get("thumbnails")
    if not isinstance(thumbnails, Iterable) or isinstance(thumbnails, (str, bytes)):
        return None
    candidates = [
        url
        for item in thumbnails
        if isinstance(item, Mapping)
        if (url := _nullable_string(item.get("url"))) is not None
    ]
    return candidates[-1] if candidates else None


def _search_result(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, Mapping):
        return None

    entry_type = (_nullable_string(entry.get("_type")) or "video").lower()
    extractor_name = " ".join(
        value.lower()
        for value in (
            _nullable_string(entry.get("ie_key")),
            _nullable_string(entry.get("extractor_key")),
        )
        if value is not None
    )
    if entry_type not in ("url", "video") or any(
        blocked in extractor_name for blocked in ("channel", "playlist", "tab")
    ):
        return None

    video_id = _nullable_string(entry.get("id"))
    title = _nullable_string(entry.get("title"))
    if (
        video_id is None
        or not _YOUTUBE_VIDEO_ID_PATTERN.fullmatch(video_id)
        or title is None
    ):
        return None

    duration = _nullable_number(entry.get("duration"))
    if duration is not None and duration < 0:
        duration = None

    return {
        "id": video_id,
        "title": title,
        "uploader": _nullable_string(entry.get("uploader"))
        or _nullable_string(entry.get("channel")),
        "duration": duration,
        "thumbnail": _search_thumbnail(entry),
        "url": f"https://www.youtube.com/watch?v={video_id}",
    }


def _audio_format(format_info: Mapping[str, Any]) -> dict[str, Any] | None:
    audio_codec = _nullable_string(format_info.get("acodec"))
    format_id = _nullable_string(format_info.get("format_id"))
    if (
        format_info.get("vcodec") != "none"
        or audio_codec in (None, "none")
        or format_id is None
    ):
        return None

    file_size = _nullable_number(format_info.get("filesize"))
    if file_size is None:
        file_size = _nullable_number(format_info.get("filesize_approx"))

    return {
        "formatId": format_id,
        "ext": _nullable_string(format_info.get("ext")),
        "audioCodec": audio_codec,
        "bitrate": _nullable_number(format_info.get("abr")),
        "fileSize": file_size,
    }


def _is_source_m4a_format(format_info: Mapping[str, Any]) -> bool:
    audio_codec = _nullable_string(format_info.get("acodec"))
    extension = _nullable_string(format_info.get("ext"))
    protocol = (_nullable_string(format_info.get("protocol")) or "").lower()
    media_url = _nullable_string(format_info.get("url"))
    try:
        media_scheme = urlsplit(media_url or "").scheme.lower()
    except ValueError:
        media_scheme = ""
    return (
        _nullable_string(format_info.get("format_id")) is not None
        and format_info.get("vcodec") == "none"
        and audio_codec not in (None, "none")
        and extension is not None
        and extension.lower() == "m4a"
        # Without FFmpeg/fixup, persist only one direct HTTPS resource. HLS,
        # DASH fragment lists and SABR can leave an M4A timeline with gaps that
        # AVPlayer exposes as a long silent tail.
        and protocol == "https"
        and media_scheme == "https"
    )


def _file_size_is_plausible(
    actual_size: int,
    selected_format: Mapping[str, Any],
) -> bool:
    exact_size = _nullable_number(selected_format.get("filesize"))
    if exact_size is not None and exact_size > 0:
        tolerance = max(65_536, float(exact_size) * 0.05)
        return abs(float(actual_size) - float(exact_size)) <= tolerance

    approximate_size = _nullable_number(selected_format.get("filesize_approx"))
    if approximate_size is None or approximate_size <= 0:
        return actual_size > 0
    # filesize_approx is bitrate-derived and deliberately receives a wider
    # tolerance, while still rejecting half files and accidental duplication.
    return (
        float(approximate_size) * 0.60
        <= float(actual_size)
        <= float(approximate_size) * 1.40
    )


def _select_m4a_format(
    info: Mapping[str, Any], requested_format_id: str | None
) -> Mapping[str, Any]:
    m4a_formats = [
        item
        for item in info.get("formats") or []
        if isinstance(item, Mapping) and _is_source_m4a_format(item)
    ]
    if not m4a_formats:
        raise AuraYouTubeExtractionError(
            "NO_M4A_FORMAT",
            "Il video non espone un formato M4A audio-only scaricabile direttamente.",
        )

    if requested_format_id is not None:
        normalized_format_id = requested_format_id.strip()
        if not normalized_format_id or not _FORMAT_ID_PATTERN.fullmatch(
            normalized_format_id
        ):
            raise AuraYouTubeExtractionError(
                "INVALID_FORMAT_ID", "Il format ID M4A non e valido."
            )
        selected = next(
            (
                item
                for item in m4a_formats
                if _nullable_string(item.get("format_id")) == normalized_format_id
            ),
            None,
        )
        if selected is None:
            raise AuraYouTubeExtractionError(
                "INVALID_FORMAT_ID",
                "Il format ID richiesto non e un formato M4A audio-only valido per questo video.",
            )
        return selected

    return max(
        m4a_formats,
        key=lambda item: (
            _nullable_number(item.get("abr"))
            if _nullable_number(item.get("abr")) is not None
            else -1,
            _nullable_number(item.get("filesize"))
            or _nullable_number(item.get("filesize_approx"))
            or -1,
            _nullable_string(item.get("format_id")) or "",
        ),
    )


def _playback_headers(
    info: Mapping[str, Any], selected_format: Mapping[str, Any]
) -> dict[str, str]:
    """Return yt-dlp's request headers without exposing cookie/auth material."""
    headers: dict[str, str] = {}
    for raw_headers in (info.get("http_headers"), selected_format.get("http_headers")):
        if not isinstance(raw_headers, Mapping):
            continue
        for raw_name, raw_value in raw_headers.items():
            if not isinstance(raw_name, str) or not isinstance(raw_value, str):
                continue
            name = raw_name.strip()
            value = raw_value.strip()
            if (
                not name
                or not value
                or name.lower() in _SENSITIVE_PLAYBACK_HEADERS
                or "\r" in name
                or "\n" in name
                or "\r" in value
                or "\n" in value
            ):
                continue
            headers[name] = value
    return headers


def _select_playback_format(info: Mapping[str, Any]) -> Mapping[str, Any]:
    """Choose a direct audio-only source that AVPlayer/expo-audio can consume."""
    candidates: list[Mapping[str, Any]] = []
    for item in info.get("formats") or []:
        if not isinstance(item, Mapping):
            continue
        remote_uri = _nullable_string(item.get("url"))
        try:
            scheme = urlsplit(remote_uri or "").scheme.lower()
        except ValueError:
            scheme = ""
        if (
            item.get("vcodec") != "none"
            or _nullable_string(item.get("acodec")) in (None, "none")
            or _nullable_string(item.get("format_id")) is None
            or scheme != "https"
        ):
            continue
        candidates.append(item)

    # AVPlayer reliably supports AAC audio in an M4A/MP4 container. YouTube's
    # regular audio-only format 140 is the common result, but selection is based
    # on metadata rather than a hard-coded format ID.
    def compatibility_score(item: Mapping[str, Any]) -> int:
        extension = (_nullable_string(item.get("ext")) or "").lower()
        codec = (_nullable_string(item.get("acodec")) or "").lower()
        if extension == "m4a" and codec.startswith("mp4a"):
            return 3
        if extension in ("mp4", "aac") and (
            codec.startswith("mp4a") or codec.startswith("aac")
        ):
            return 2
        if extension == "mp3" and "mp3" in codec:
            return 1
        return 0

    ios_candidates = [item for item in candidates if compatibility_score(item) > 0]
    if not ios_candidates:
        raise AuraYouTubeExtractionError(
            "NO_PLAYABLE_AUDIO",
            "Il video non espone un formato audio diretto compatibile con iOS.",
        )

    return max(
        ios_candidates,
        key=lambda item: (
            compatibility_score(item),
            _nullable_number(item.get("abr")) or -1,
            _nullable_number(item.get("tbr")) or -1,
            _nullable_number(item.get("filesize"))
            or _nullable_number(item.get("filesize_approx"))
            or -1,
        ),
    )


def _build_playback_dto(
    info: Mapping[str, Any], selected_format: Mapping[str, Any]
) -> dict[str, Any]:
    video_id = _nullable_string(info.get("id"))
    title = _nullable_string(info.get("title"))
    remote_uri = _nullable_string(selected_format.get("url"))
    format_id = _nullable_string(selected_format.get("format_id"))
    if video_id is None or title is None or remote_uri is None or format_id is None:
        raise AuraYouTubeExtractionError(
            "INVALID_PLAYBACK_SOURCE",
            "yt-dlp non ha restituito una sorgente audio completa.",
        )

    return {
        "videoId": video_id,
        "title": title,
        "artist": _nullable_string(info.get("uploader"))
        or _nullable_string(info.get("channel")),
        "thumbnail": _nullable_string(info.get("thumbnail")),
        "duration": _nullable_number(info.get("duration")),
        "remoteUri": remote_uri,
        "formatId": format_id,
        "ext": _nullable_string(selected_format.get("ext")),
        "headers": _playback_headers(info, selected_format),
    }


def _build_dto(info: Mapping[str, Any]) -> dict[str, Any]:
    audio_formats = [
        audio_format
        for raw_format in info.get("formats") or []
        if isinstance(raw_format, Mapping)
        if (audio_format := _audio_format(raw_format)) is not None
    ]
    m4a_formats = [
        audio_format
        for raw_format in info.get("formats") or []
        if isinstance(raw_format, Mapping) and _is_source_m4a_format(raw_format)
        if (audio_format := _audio_format(raw_format)) is not None
    ]
    preferred_m4a = max(
        m4a_formats,
        key=lambda item: (
            item["bitrate"] if item["bitrate"] is not None else -1,
            item["fileSize"] if item["fileSize"] is not None else -1,
            item["formatId"],
        ),
        default=None,
    )

    video_id = _nullable_string(info.get("id"))
    title = _nullable_string(info.get("title"))
    webpage_url = _nullable_string(info.get("webpage_url"))
    if video_id is None or title is None or webpage_url is None:
        raise AuraYouTubeExtractionError(
            "INVALID_METADATA", "yt-dlp non ha restituito i metadata video richiesti."
        )

    return {
        "id": video_id,
        "title": title,
        "uploader": _nullable_string(info.get("uploader")),
        "duration": _nullable_number(info.get("duration")),
        "thumbnail": _nullable_string(info.get("thumbnail")),
        "webpageUrl": webpage_url,
        "audioFormats": audio_formats,
        "hasM4aAudio": bool(m4a_formats),
        "preferredM4aFormatId": (
            preferred_m4a["formatId"] if preferred_m4a is not None else None
        ),
    }


def _error_chain(error: BaseException) -> list[BaseException]:
    chain: list[BaseException] = []
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        chain.append(current)

        cause = getattr(current, "cause", None)
        if isinstance(cause, BaseException):
            pending.append(cause)
        exc_info = getattr(current, "exc_info", None)
        if isinstance(exc_info, tuple) and len(exc_info) > 1:
            nested = exc_info[1]
            if isinstance(nested, BaseException):
                pending.append(nested)
    return chain


def _classify_download_error(error: BaseException) -> AuraYouTubeExtractionError:
    diagnostic = str(error).lower()
    error_chain = _error_chain(error)

    for item in error_chain:
        if isinstance(item, OSError):
            if item.errno == errno.ENOSPC:
                return AuraYouTubeExtractionError(
                    "DISK_FULL", "Spazio insufficiente per completare il download."
                )
            if item.errno in (errno.EACCES, errno.EPERM, errno.EROFS):
                return AuraYouTubeExtractionError(
                    "FILESYSTEM_ERROR",
                    "AuraMusic non puo scrivere il file nella directory Documents.",
                )

    if any(isinstance(item, (socket.timeout, TimeoutError)) for item in error_chain) or any(
        term in diagnostic for term in ("timed out", "timeout")
    ):
        return AuraYouTubeExtractionError(
            "NETWORK_TIMEOUT", "La richiesta a YouTube ha superato il timeout."
        )
    if any(isinstance(item, CertificateVerifyError) for item in error_chain):
        return AuraYouTubeExtractionError(
            "TLS_ERROR", "La connessione HTTPS a YouTube non ha superato la verifica TLS."
        )
    if any(isinstance(item, GeoRestrictedError) for item in error_chain):
        return AuraYouTubeExtractionError(
            "RESTRICTED_VIDEO", "Il video non è disponibile in questa area geografica."
        )
    if any(isinstance(item, UnsupportedError) for item in error_chain):
        return AuraYouTubeExtractionError(
            "UNSUPPORTED_URL", "yt-dlp non riconosce questo URL YouTube."
        )

    http_status: int | None = None
    for item in error_chain:
        if not isinstance(item, HTTPError):
            continue
        status = getattr(item, "status", None)
        if isinstance(status, int):
            http_status = status
            break
    if http_status is None:
        status_match = re.search(r"\bhttp error (\d{3})\b", diagnostic)
        if status_match is not None:
            http_status = int(status_match.group(1))

    if http_status in (401, 403):
        return AuraYouTubeExtractionError(
            "MEDIA_ACCESS_DENIED",
            "YouTube ha rifiutato l'accesso diretto al formato M4A selezionato.",
        )
    if http_status == 429:
        return AuraYouTubeExtractionError(
            "YOUTUBE_RATE_LIMITED",
            "YouTube ha temporaneamente limitato le richieste. Riprova piu tardi.",
        )
    if http_status is not None:
        return AuraYouTubeExtractionError(
            "YOUTUBE_HTTP_ERROR",
            f"YouTube ha risposto con errore HTTP {http_status}.",
        )
    if any(isinstance(item, (TransportError, RequestError)) for item in error_chain):
        return AuraYouTubeExtractionError(
            "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
        )
    if "private video" in diagnostic or "video is private" in diagnostic:
        return AuraYouTubeExtractionError(
            "PRIVATE_VIDEO", "Il video YouTube è privato."
        )
    if any(
        term in diagnostic
        for term in ("challenge", "javascript", "js runtime", "nsig", "signature solving")
    ):
        return AuraYouTubeExtractionError(
            "JS_CHALLENGE_ERROR", "La challenge JavaScript di YouTube non è stata risolta."
        )
    if any(
        term in diagnostic
        for term in (
            "removed",
            "deleted",
            "video unavailable",
            "video isn't available",
            "video does not exist",
        )
    ):
        return AuraYouTubeExtractionError(
            "VIDEO_UNAVAILABLE", "Il video YouTube non esiste più o non è disponibile."
        )
    if any(
        term in diagnostic
        for term in ("age-restricted", "age restricted", "sign in", "members-only", "geo")
    ):
        return AuraYouTubeExtractionError(
            "RESTRICTED_VIDEO", "Il video richiede accesso o è soggetto a restrizioni."
        )
    return AuraYouTubeExtractionError(
        "EXTRACTOR_ERROR", "yt-dlp non è riuscito a estrarre i metadata del video."
    )


def _error_envelope(error: AuraYouTubeExtractionError) -> str:
    return json.dumps(
        {"ok": False, "error": {"code": error.code, "message": error.message}},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _success_envelope(data: Any) -> str:
    return json.dumps(
        {"ok": True, "data": data},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def search_youtube_json(
    raw_query: str,
    requested_limit: int = _DEFAULT_SEARCH_LIMIT,
) -> str:
    """Return flat normal-video search results without downloading media."""
    logger = AuraYtDlpLogger()

    try:
        query = _validate_search_query(raw_query)
        limit = _normalize_search_limit(requested_limit)
        provider = test_apple_webkit_provider()
        logger.debug(
            "Apple WebKit JS Challenge Provider ready for search: "
            f"{provider['provider']} {provider['version']}"
        )

        options = {
            "quiet": True,
            "verbose": True,
            "skip_download": True,
            "simulate": True,
            "extract_flat": "in_playlist",
            "noplaylist": True,
            "playlistend": limit,
            "socket_timeout": _NETWORK_TIMEOUT_SECONDS,
            "retries": 1,
            "extractor_retries": 1,
            "fragment_retries": 0,
            "cachedir": False,
            "writethumbnail": False,
            "writeinfojson": False,
            "writesubtitles": False,
            "writeautomaticsub": False,
            "logger": logger,
        }
        search_expression = f"ytsearch{limit}:{query}"
        with YoutubeDL(options) as ydl:
            extracted_info = ydl.extract_info(search_expression, download=False)

        if not isinstance(extracted_info, Mapping):
            raise AuraYouTubeExtractionError(
                "INVALID_SEARCH_RESPONSE",
                "yt-dlp non ha restituito una risposta di ricerca valida.",
            )
        entries = extracted_info.get("entries")
        if not isinstance(entries, Iterable) or isinstance(entries, (str, bytes)):
            raise AuraYouTubeExtractionError(
                "INVALID_SEARCH_RESPONSE",
                "yt-dlp non ha restituito una lista di risultati valida.",
            )

        results: list[dict[str, Any]] = []
        for entry in entries:
            result = _search_result(entry)
            if result is not None:
                results.append(result)
            if len(results) >= limit:
                break

        logger.debug(
            f"Search completed with {len(results)} normal video result(s)"
        )
        return _success_envelope(results)
    except AuraYouTubeExtractionError as error:
        logger.error(f"{error.code}: {error.message}")
        return _error_envelope(error)
    except AuraYtDlpAppleProviderError as error:
        logger.error(f"APPLE_PROVIDER_UNAVAILABLE: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "APPLE_PROVIDER_UNAVAILABLE",
                "Il provider Apple WebKit non e disponibile nel runtime iOS.",
            )
        )
    except DownloadError as error:
        classified_error = _classify_download_error(error)
        logger.error(f"{classified_error.code}: {error}")
        return _error_envelope(classified_error)
    except (socket.timeout, TimeoutError) as error:
        logger.error(f"NETWORK_TIMEOUT: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_TIMEOUT", "La ricerca YouTube ha superato il timeout."
            )
        )
    except CertificateVerifyError as error:
        logger.error(f"TLS_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "TLS_ERROR",
                "La connessione HTTPS a YouTube non ha superato la verifica TLS.",
            )
        )
    except (TransportError, RequestError) as error:
        logger.error(f"NETWORK_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
            )
        )
    except BaseException as error:
        logger.error(f"PYTHON_ERROR: {type(error).__name__}: {error}")
        print(
            "AuraMusic YouTube search traceback:\n"
            + _redact_log_message(traceback.format_exc()),
            file=sys.stderr,
            flush=True,
        )
        return _error_envelope(
            AuraYouTubeExtractionError(
                "PYTHON_ERROR", "Errore Python inatteso durante la ricerca YouTube."
            )
        )


def _validate_destination_directory(raw_path: str) -> str:
    if not isinstance(raw_path, str) or not raw_path:
        raise AuraYouTubeExtractionError(
            "FILESYSTEM_ERROR", "La directory di destinazione iOS non e valida."
        )
    destination = os.path.realpath(raw_path)
    if not os.path.isabs(destination) or not os.path.isdir(destination):
        raise AuraYouTubeExtractionError(
            "FILESYSTEM_ERROR", "La directory di destinazione iOS non e disponibile."
        )
    return destination


def _safe_output_path(destination: str, video_id: str) -> str:
    if not _VIDEO_ID_PATTERN.fullmatch(video_id):
        raise AuraYouTubeExtractionError(
            "INVALID_METADATA", "yt-dlp ha restituito un video ID non sicuro."
        )
    output_path = os.path.realpath(os.path.join(destination, f"{video_id}.m4a"))
    if os.path.commonpath((destination, output_path)) != destination:
        raise AuraYouTubeExtractionError(
            "FILESYSTEM_ERROR", "Il percorso M4A calcolato non e sicuro."
        )
    return output_path


def _remove_incomplete_files(destination: str, video_id: str, logger: AuraYtDlpLogger) -> None:
    prefixes = (f"{video_id}.m4a.part", f"{video_id}.m4a.ytdl")
    try:
        names = os.listdir(destination)
    except OSError as error:
        logger.warning(f"Unable to inspect partial files: {type(error).__name__}")
        return

    for name in names:
        if not name.startswith(prefixes):
            continue
        candidate = os.path.realpath(os.path.join(destination, name))
        if os.path.commonpath((destination, candidate)) != destination:
            continue
        try:
            if os.path.isfile(candidate) and not os.path.islink(candidate):
                os.remove(candidate)
                logger.debug(f"Removed incomplete file: {name}")
        except OSError as error:
            logger.warning(
                f"Unable to remove incomplete file {name}: {type(error).__name__}"
            )


def _progress_payload(status: Mapping[str, Any]) -> dict[str, Any] | None:
    progress_status = status.get("status")
    if progress_status not in ("downloading", "finished"):
        return None

    downloaded_bytes = _nullable_number(status.get("downloaded_bytes"))
    total_bytes = _nullable_number(status.get("total_bytes"))
    total_bytes_estimate = _nullable_number(status.get("total_bytes_estimate"))
    total = total_bytes if total_bytes is not None else total_bytes_estimate
    progress: float | None = None
    if progress_status == "finished":
        progress = 1.0
    elif (
        downloaded_bytes is not None
        and total is not None
        and total > 0
    ):
        progress = min(1.0, max(0.0, float(downloaded_bytes) / float(total)))

    return {
        "status": progress_status,
        "downloadedBytes": downloaded_bytes,
        "totalBytes": total_bytes,
        "totalBytesEstimate": total_bytes_estimate,
        "speed": _nullable_number(status.get("speed")),
        "eta": _nullable_number(status.get("eta")),
        "progress": progress,
    }


def _extract_info_with_access_retries(
    url: str,
    options: Mapping[str, Any],
    *,
    download: bool,
    logger: AuraYtDlpLogger,
    before_retry: Any = None,
) -> Any:
    operation = "M4A download" if download else "M4A metadata refresh"
    for attempt in range(1, _MEDIA_ACCESS_ATTEMPTS + 1):
        logger.debug(
            f"Starting {operation} attempt={attempt}/{_MEDIA_ACCESS_ATTEMPTS}"
        )
        try:
            # A new YoutubeDL instance forces a fresh extraction and therefore
            # obtains fresh player/media URLs before every access-denied retry.
            with YoutubeDL(dict(options)) as ydl:
                return ydl.extract_info(url, download=download)
        except (DownloadError, HTTPError) as error:
            classified_error = _classify_download_error(error)
            if (
                classified_error.code != "MEDIA_ACCESS_DENIED"
                or attempt >= _MEDIA_ACCESS_ATTEMPTS
            ):
                raise

            logger.warning(
                f"YouTube rejected {operation}; refreshing extraction before "
                f"retry {attempt + 1}/{_MEDIA_ACCESS_ATTEMPTS}"
            )
            if callable(before_retry):
                before_retry()
            time.sleep(_MEDIA_ACCESS_RETRY_DELAY_SECONDS * attempt)

    raise RuntimeError(f"{operation} retry loop ended unexpectedly")


def resolve_youtube_playback_source_json(raw_url: str) -> str:
    """Resolve one ephemeral direct audio URL without downloading media."""
    logger = AuraYtDlpLogger()
    try:
        url = _validate_url(raw_url)
        provider = test_apple_webkit_provider()
        logger.debug(
            "Apple WebKit JS Challenge Provider ready for playback resolution: "
            f"{provider['provider']} {provider['version']}"
        )
        options = {
            "quiet": True,
            "verbose": True,
            "skip_download": True,
            "simulate": True,
            "noplaylist": True,
            "socket_timeout": _NETWORK_TIMEOUT_SECONDS,
            "retries": 1,
            "extractor_retries": 1,
            "fragment_retries": 0,
            "cachedir": False,
            "writethumbnail": False,
            "writeinfojson": False,
            "writesubtitles": False,
            "writeautomaticsub": False,
            "getcomments": False,
            "logger": logger,
        }
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
        if not isinstance(info, Mapping):
            raise AuraYouTubeExtractionError(
                "INVALID_METADATA", "yt-dlp non ha restituito un video valido."
            )
        selected_format = _select_playback_format(info)
        logger.debug(
            "Resolved ephemeral iOS playback source: "
            f"id={info.get('id', '<unknown>')} "
            f"format={selected_format.get('format_id', '<unknown>')}"
        )
        return _success_envelope(_build_playback_dto(info, selected_format))
    except AuraYouTubeExtractionError as error:
        logger.error(f"{error.code}: {error.message}")
        return _error_envelope(error)
    except AuraYtDlpAppleProviderError as error:
        logger.error(f"APPLE_PROVIDER_UNAVAILABLE: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "APPLE_PROVIDER_UNAVAILABLE",
                "Il provider Apple WebKit non è disponibile nel runtime iOS.",
            )
        )
    except (DownloadError, HTTPError) as error:
        classified_error = _classify_download_error(error)
        logger.error(f"{classified_error.code}: {error}")
        return _error_envelope(classified_error)
    except (socket.timeout, TimeoutError) as error:
        logger.error(f"NETWORK_TIMEOUT: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_TIMEOUT", "La sorgente audio ha superato il timeout."
            )
        )
    except CertificateVerifyError as error:
        logger.error(f"TLS_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "TLS_ERROR", "La connessione HTTPS a YouTube non ha superato la verifica TLS."
            )
        )
    except (TransportError, RequestError) as error:
        logger.error(f"NETWORK_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
            )
        )
    except BaseException as error:
        logger.error(f"PYTHON_ERROR: {type(error).__name__}: {error}")
        print(
            "AuraMusic playback source traceback:\n"
            + _redact_log_message(traceback.format_exc()),
            file=sys.stderr,
            flush=True,
        )
        return _error_envelope(
            AuraYouTubeExtractionError(
                "PYTHON_ERROR", "Errore Python durante la risoluzione della sorgente audio."
            )
        )


def download_youtube_m4a_json(
    raw_url: str,
    requested_format_id: str | None,
    destination_directory: str,
    progress_callback: Any = None,
) -> str:
    """Download one source M4A and return AuraMusic's stable JSON envelope."""
    logger = AuraYtDlpLogger()
    output_path: str | None = None
    video_id: str | None = None
    download_succeeded = False

    try:
        url = _validate_url(raw_url)
        destination = _validate_destination_directory(destination_directory)
        provider = test_apple_webkit_provider()
        logger.debug(
            "Apple WebKit JS Challenge Provider ready for download: "
            f"{provider['provider']} {provider['version']}"
        )

        metadata_options = {
            "quiet": True,
            "verbose": True,
            "skip_download": True,
            "simulate": True,
            "noplaylist": True,
            "socket_timeout": _NETWORK_TIMEOUT_SECONDS,
            "retries": _DOWNLOAD_RETRIES,
            "extractor_retries": _EXTRACTOR_RETRIES,
            "fragment_retries": 0,
            "cachedir": False,
            "logger": logger,
        }
        extracted_info = _extract_info_with_access_retries(
            url,
            metadata_options,
            download=False,
            logger=logger,
        )

        if not isinstance(extracted_info, Mapping):
            raise AuraYouTubeExtractionError(
                "INVALID_METADATA", "yt-dlp non ha restituito un video valido."
            )

        video_id = _nullable_string(extracted_info.get("id"))
        title = _nullable_string(extracted_info.get("title"))
        if video_id is None or title is None:
            raise AuraYouTubeExtractionError(
                "INVALID_METADATA", "yt-dlp non ha restituito i metadata richiesti."
            )

        selected_format = _select_m4a_format(extracted_info, requested_format_id)
        selected_format_id = _nullable_string(selected_format.get("format_id"))
        if selected_format_id is None:
            raise AuraYouTubeExtractionError(
                "INVALID_FORMAT_ID", "Il formato M4A selezionato non ha un format ID."
            )

        output_path = _safe_output_path(destination, video_id)
        if os.path.lexists(output_path):
            if os.path.islink(output_path) or not os.path.isfile(output_path):
                raise AuraYouTubeExtractionError(
                    "FILESYSTEM_ERROR", "Il percorso M4A esistente non e un file regolare."
                )
            existing_size = os.path.getsize(output_path)
            if existing_size > 0 and _file_size_is_plausible(
                existing_size, selected_format
            ):
                download_succeeded = True
                _remove_incomplete_files(destination, video_id, logger)
                return _success_envelope(
                    {
                        "success": True,
                        "alreadyExists": True,
                        "videoId": video_id,
                        "title": title,
                        "formatId": selected_format_id,
                        "ext": "m4a",
                        "localPath": output_path,
                        "fileSize": existing_size,
                    }
                )
            logger.warning(
                "Existing M4A failed size validation and will be downloaded again"
            )
            os.remove(output_path)

        _remove_incomplete_files(destination, video_id, logger)

        def progress_hook(status: Mapping[str, Any]) -> None:
            payload = _progress_payload(status)
            if payload is None or not callable(progress_callback):
                return
            try:
                progress_callback(
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                )
            except Exception as error:
                logger.warning(
                    f"Progress event delivery failed: {type(error).__name__}"
                )

        download_options = {
            # Re-extraction can expose the same format ID over several
            # protocols. Keep the actual download on the direct HTTPS variant
            # selected above, which is playable by AVPlayer without FFmpeg.
            "format": f"{selected_format_id}[protocol=https]",
            "noplaylist": True,
            "paths": {"home": destination},
            "outtmpl": {"default": "%(id)s.%(ext)s"},
            "quiet": True,
            "verbose": True,
            "socket_timeout": _NETWORK_TIMEOUT_SECONDS,
            "retries": _DOWNLOAD_RETRIES,
            "extractor_retries": _EXTRACTOR_RETRIES,
            "fragment_retries": _FRAGMENT_RETRIES,
            "file_access_retries": 2,
            "cachedir": False,
            "continuedl": False,
            "overwrites": False,
            "nopart": False,
            "fixup": "never",
            "writeinfojson": False,
            "writethumbnail": False,
            "writesubtitles": False,
            "writeautomaticsub": False,
            "getcomments": False,
            "progress_hooks": [progress_hook],
            "logger": logger,
        }
        logger.debug(
            f"Selected direct source M4A format={selected_format_id}"
        )

        def reset_failed_download() -> None:
            _remove_incomplete_files(destination, video_id, logger)
            if os.path.isfile(output_path) and not os.path.islink(output_path):
                os.remove(output_path)

        _extract_info_with_access_retries(
            url,
            download_options,
            download=True,
            logger=logger,
            before_retry=reset_failed_download,
        )

        if not os.path.isfile(output_path) or os.path.islink(output_path):
            raise AuraYouTubeExtractionError(
                "FILESYSTEM_ERROR", "Il download non ha prodotto il file M4A previsto."
            )
        file_size = os.path.getsize(output_path)
        if file_size <= 0:
            raise AuraYouTubeExtractionError(
                "FILESYSTEM_ERROR", "Il file M4A scaricato e vuoto."
            )
        if not _file_size_is_plausible(file_size, selected_format):
            os.remove(output_path)
            raise AuraYouTubeExtractionError(
                "INVALID_MEDIA_FILE",
                "Il file M4A scaricato risulta incompleto o duplicato.",
            )

        download_succeeded = True
        _remove_incomplete_files(destination, video_id, logger)
        logger.debug(
            f"Direct M4A download completed: id={video_id} format={selected_format_id}"
        )
        return _success_envelope(
            {
                "success": True,
                "alreadyExists": False,
                "videoId": video_id,
                "title": title,
                "formatId": selected_format_id,
                "ext": "m4a",
                "localPath": output_path,
                "fileSize": file_size,
            }
        )
    except AuraYouTubeExtractionError as error:
        logger.error(f"{error.code}: {error.message}")
        return _error_envelope(error)
    except AuraYtDlpAppleProviderError as error:
        logger.error(f"APPLE_PROVIDER_UNAVAILABLE: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "APPLE_PROVIDER_UNAVAILABLE",
                "Il provider Apple WebKit non e disponibile nel runtime iOS.",
            )
        )
    except GeoRestrictedError as error:
        logger.error(f"RESTRICTED_VIDEO: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "RESTRICTED_VIDEO",
                "Il video non e disponibile in questa area geografica.",
            )
        )
    except UnsupportedError as error:
        logger.error(f"UNSUPPORTED_URL: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "UNSUPPORTED_URL", "yt-dlp non riconosce questo URL YouTube."
            )
        )
    except DownloadCancelled as error:
        logger.error(f"DOWNLOAD_INTERRUPTED: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "DOWNLOAD_INTERRUPTED", "Il download M4A e stato interrotto."
            )
        )
    except DownloadError as error:
        classified_error = _classify_download_error(error)
        logger.error(f"{classified_error.code}: {error}")
        return _error_envelope(classified_error)
    except HTTPError as error:
        classified_error = _classify_download_error(error)
        logger.error(f"{classified_error.code}: {error}")
        return _error_envelope(classified_error)
    except (socket.timeout, TimeoutError) as error:
        logger.error(f"NETWORK_TIMEOUT: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_TIMEOUT", "Il download da YouTube ha superato il timeout."
            )
        )
    except CertificateVerifyError as error:
        logger.error(f"TLS_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "TLS_ERROR",
                "La connessione HTTPS a YouTube non ha superato la verifica TLS.",
            )
        )
    except (TransportError, RequestError) as error:
        logger.error(f"NETWORK_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
            )
        )
    except KeyboardInterrupt as error:
        logger.error(f"DOWNLOAD_INTERRUPTED: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "DOWNLOAD_INTERRUPTED", "Il download M4A e stato interrotto."
            )
        )
    except OSError as error:
        code = "DISK_FULL" if error.errno == errno.ENOSPC else "FILESYSTEM_ERROR"
        message = (
            "Spazio insufficiente per completare il download."
            if code == "DISK_FULL"
            else "Errore filesystem durante il download M4A."
        )
        logger.error(f"{code}: {type(error).__name__}: {error}")
        return _error_envelope(AuraYouTubeExtractionError(code, message))
    except BaseException as error:
        logger.error(f"PYTHON_ERROR: {type(error).__name__}: {error}")
        print(
            "AuraMusic YouTube M4A download traceback:\n"
            + _redact_log_message(traceback.format_exc()),
            file=sys.stderr,
            flush=True,
        )
        return _error_envelope(
            AuraYouTubeExtractionError(
                "PYTHON_ERROR", "Errore Python inatteso durante il download M4A."
            )
        )
    finally:
        if not download_succeeded and output_path is not None and video_id is not None:
            _remove_incomplete_files(
                os.path.dirname(output_path), video_id, logger
            )
            try:
                if os.path.isfile(output_path) and not os.path.islink(output_path):
                    os.remove(output_path)
                    logger.debug("Removed unverified final M4A after download failure")
            except OSError as cleanup_error:
                logger.warning(
                    "Unable to remove unverified final M4A: "
                    f"{type(cleanup_error).__name__}"
                )


def extract_youtube_info_json(raw_url: str) -> str:
    """Run yt-dlp once and return only AuraMusic's stable JSON envelope."""
    logger = AuraYtDlpLogger()

    try:
        url = _validate_url(raw_url)
        provider = test_apple_webkit_provider()
        logger.debug(
            "Apple WebKit JS Challenge Provider ready: "
            f"{provider['provider']} {provider['version']}"
        )

        options = {
            "quiet": True,
            "verbose": True,
            "skip_download": True,
            "simulate": True,
            "noplaylist": True,
            "socket_timeout": _NETWORK_TIMEOUT_SECONDS,
            "retries": 1,
            "extractor_retries": 1,
            "fragment_retries": 0,
            "cachedir": False,
            "logger": logger,
        }
        with YoutubeDL(options) as ydl:
            extracted_info = ydl.extract_info(url, download=False)
            if not isinstance(extracted_info, Mapping):
                raise AuraYouTubeExtractionError(
                    "INVALID_METADATA", "yt-dlp non ha restituito un video valido."
                )
            info = ydl.sanitize_info(extracted_info)

        if not isinstance(info, Mapping):
            raise AuraYouTubeExtractionError(
                "INVALID_METADATA", "I metadata sanitizzati non sono validi."
            )
        logger.debug(
            f"Extraction completed with extractor={info.get('extractor_key', '<unknown>')}"
        )
        return json.dumps(
            {"ok": True, "data": _build_dto(info)},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    except AuraYouTubeExtractionError as error:
        logger.error(f"{error.code}: {error.message}")
        return _error_envelope(error)
    except AuraYtDlpAppleProviderError as error:
        logger.error(f"APPLE_PROVIDER_UNAVAILABLE: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "APPLE_PROVIDER_UNAVAILABLE",
                "Il provider Apple WebKit non è disponibile nel runtime iOS.",
            )
        )
    except GeoRestrictedError as error:
        logger.error(f"RESTRICTED_VIDEO: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "RESTRICTED_VIDEO", "Il video non è disponibile in questa area geografica."
            )
        )
    except UnsupportedError as error:
        logger.error(f"UNSUPPORTED_URL: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "UNSUPPORTED_URL", "yt-dlp non riconosce questo URL YouTube."
            )
        )
    except DownloadError as error:
        classified_error = _classify_download_error(error)
        logger.error(f"{classified_error.code}: {error}")
        return _error_envelope(classified_error)
    except (socket.timeout, TimeoutError) as error:
        logger.error(f"NETWORK_TIMEOUT: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_TIMEOUT", "La richiesta a YouTube ha superato il timeout."
            )
        )
    except CertificateVerifyError as error:
        logger.error(f"TLS_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "TLS_ERROR", "La connessione HTTPS a YouTube non ha superato la verifica TLS."
            )
        )
    except (TransportError, RequestError) as error:
        logger.error(f"NETWORK_ERROR: {error}")
        return _error_envelope(
            AuraYouTubeExtractionError(
                "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
            )
        )
    except BaseException as error:
        logger.error(f"PYTHON_ERROR: {type(error).__name__}: {error}")
        print(
            "AuraMusic YouTube metadata traceback:\n"
            + _redact_log_message(traceback.format_exc()),
            file=sys.stderr,
            flush=True,
        )
        return _error_envelope(
            AuraYouTubeExtractionError(
                "PYTHON_ERROR", "Errore Python inatteso durante l'estrazione dei metadata."
            )
        )
