"""Metadata-only YouTube extraction for AuraMusic's embedded CPython POC."""

from __future__ import annotations

import json
import re
import socket
import sys
import traceback
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

from aura_yt_dlp_apple_provider import (
    AuraYtDlpAppleProviderError,
    test_apple_webkit_provider,
)
from yt_dlp import YoutubeDL
from yt_dlp.networking.exceptions import (
    CertificateVerifyError,
    RequestError,
    TransportError,
)
from yt_dlp.utils import DownloadError, GeoRestrictedError, UnsupportedError


_ALLOWED_HOSTS = frozenset(
    {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
)
_NETWORK_TIMEOUT_SECONDS = 25
_MAX_DIAGNOSTIC_LOG_ENTRIES = 200
_URL_PATTERN = re.compile(r"https://[^\s\]\[<>()\"']+", re.IGNORECASE)
_SENSITIVE_PATTERN = re.compile(
    r"(?i)(authorization|cookie|set-cookie|x-goog-visitor-id|signature|sig|token)"
    r"\s*[:=]\s*[^\s,;]+"
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
    text = _URL_PATTERN.sub(lambda match: urlsplit(match.group(0))._replace(query="").geturl(), text)
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


def _nullable_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _nullable_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def _audio_format(format_info: Mapping[str, Any]) -> dict[str, Any] | None:
    audio_codec = _nullable_string(format_info.get("acodec"))
    if format_info.get("vcodec") != "none" or audio_codec in (None, "none"):
        return None

    file_size = _nullable_number(format_info.get("filesize"))
    if file_size is None:
        file_size = _nullable_number(format_info.get("filesize_approx"))

    return {
        "formatId": str(format_info.get("format_id", "")),
        "ext": _nullable_string(format_info.get("ext")),
        "audioCodec": audio_codec,
        "bitrate": _nullable_number(format_info.get("abr")),
        "fileSize": file_size,
    }


def _build_dto(info: Mapping[str, Any]) -> dict[str, Any]:
    audio_formats = [
        audio_format
        for raw_format in info.get("formats") or []
        if isinstance(raw_format, Mapping)
        if (audio_format := _audio_format(raw_format)) is not None
    ]
    m4a_formats = [item for item in audio_formats if item["ext"] == "m4a"]
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


def _classify_download_error(error: DownloadError) -> AuraYouTubeExtractionError:
    diagnostic = str(error).lower()
    cause = error.exc_info[1] if error.exc_info else None

    if isinstance(cause, (socket.timeout, TimeoutError)) or "timed out" in diagnostic:
        return AuraYouTubeExtractionError(
            "NETWORK_TIMEOUT", "La richiesta a YouTube ha superato il timeout."
        )
    if isinstance(cause, CertificateVerifyError):
        return AuraYouTubeExtractionError(
            "TLS_ERROR", "La connessione HTTPS a YouTube non ha superato la verifica TLS."
        )
    if isinstance(cause, (TransportError, RequestError)):
        return AuraYouTubeExtractionError(
            "NETWORK_ERROR", "Impossibile contattare YouTube. Controlla la connessione."
        )
    if "private video" in diagnostic or "video is private" in diagnostic:
        return AuraYouTubeExtractionError(
            "PRIVATE_VIDEO", "Il video YouTube è privato."
        )
    if any(term in diagnostic for term in ("removed", "deleted", "video unavailable", "not available")):
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
    if any(
        term in diagnostic
        for term in ("challenge", "javascript", "js runtime", "nsig", "signature solving")
    ):
        return AuraYouTubeExtractionError(
            "JS_CHALLENGE_ERROR", "La challenge JavaScript di YouTube non è stata risolta."
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
            "AuraMusic YouTube metadata traceback:\n" + traceback.format_exc(),
            file=sys.stderr,
            flush=True,
        )
        return _error_envelope(
            AuraYouTubeExtractionError(
                "PYTHON_ERROR", "Errore Python inatteso durante l'estrazione dei metadata."
            )
        )
