"""Offline validation for AuraMusic's Apple WebKit yt-dlp provider POC."""

from __future__ import annotations

import importlib.metadata
import importlib.util
import json
import sys
from typing import Any


_DISTRIBUTION_NAME = "yt-dlp-apple-webkit-jsi"
_EXPECTED_PROVIDER_NAME = "apple-webkit-jsi"


class AuraYtDlpAppleProviderError(RuntimeError):
    """Raised with embedded-runtime diagnostics when provider validation fails."""


class _SilentWebKitProbeLogger:
    """Logger accepted by the plugin's WebKit loader without noisy test output."""

    def trace(self, message: str) -> None:
        del message

    def debug(self, message: str, *, once: bool = False) -> None:
        del message, once

    def info(self, message: str) -> None:
        del message

    def warning(self, message: str, *, once: bool = False) -> None:
        del message, once

    def error(self, message: str, *, cause: BaseException | None = None) -> None:
        del message, cause


def _registered_provider_snapshot() -> list[dict[str, str]]:
    try:
        from yt_dlp.extractor.youtube.jsc._registry import _jsc_providers
    except Exception:
        return []

    return sorted(
        (
            {
                "key": str(key),
                "name": str(getattr(provider, "PROVIDER_NAME", "<missing>")),
                "version": str(getattr(provider, "PROVIDER_VERSION", "<missing>")),
                "module": str(getattr(provider, "__module__", "<missing>")),
            }
            for key, provider in _jsc_providers.value.items()
        ),
        key=lambda item: item["key"],
    )


def _diagnostics(discovery_directories: list[str]) -> dict[str, Any]:
    try:
        from yt_dlp.globals import all_plugins_loaded

        discovery_loaded: bool | str = bool(all_plugins_loaded.value)
    except Exception as error:
        discovery_loaded = f"unavailable: {type(error).__name__}: {error}"

    try:
        namespace_spec = importlib.util.find_spec("yt_dlp_plugins")
        namespace_locations = (
            list(namespace_spec.submodule_search_locations or []) if namespace_spec else []
        )
    except Exception as error:
        namespace_locations = [f"unavailable: {type(error).__name__}: {error}"]

    return {
        "sys.path": list(sys.path),
        "plugin_discovery_loaded": discovery_loaded,
        "plugin_directories": discovery_directories,
        "namespace_locations": namespace_locations,
        "imported_plugin_modules": sorted(
            name for name in sys.modules if name.startswith("yt_dlp_plugins")
        ),
        "registered_providers": _registered_provider_snapshot(),
    }


def _probe_webkit_access() -> None:
    """Use the plugin's own loader to resolve WebKit without creating a webview."""
    from yt_dlp_plugins.webkit_jsi.lib.pyneapple_objc import PyNeApple

    with PyNeApple(logger=_SilentWebKitProbeLogger()) as apple_runtime:
        apple_runtime.load_framework_from_path("Foundation")
        apple_runtime.load_framework_from_path("CoreFoundation")
        apple_runtime.load_framework_from_path("WebKit")
        apple_runtime.safe_objc_getClass(b"WKWebView")


def test_apple_webkit_provider() -> dict[str, bool | str]:
    """Discover, register and validate the Apple provider without network access."""
    discovery_directories: list[str] = []

    try:
        import yt_dlp  # noqa: F401 - importing the package is part of the POC
        import yt_dlp.extractor  # registers yt-dlp's normal extractor plugin spec
        from yt_dlp.extractor.youtube.jsc._registry import _jsc_providers
        from yt_dlp.globals import all_plugins_loaded
        from yt_dlp.plugins import directories, load_all_plugins

        discovery_directories = [str(path) for path in directories()]
        if not discovery_directories:
            raise ModuleNotFoundError("yt_dlp_plugins namespace is not discoverable")

        if not all_plugins_loaded.value:
            load_all_plugins()

        plugin_module = sys.modules.get("yt_dlp_plugins.extractor.ytjsc")
        if plugin_module is None:
            raise ModuleNotFoundError(
                "yt-dlp discovery did not load yt_dlp_plugins.extractor.ytjsc"
            )

        provider_class = next(
            (
                provider
                for provider in _jsc_providers.value.values()
                if getattr(provider, "PROVIDER_NAME", None) == _EXPECTED_PROVIDER_NAME
            ),
            None,
        )
        if provider_class is None:
            raise LookupError(
                f"JS Challenge Provider {_EXPECTED_PROVIDER_NAME!r} is not registered"
            )

        provider_module = str(getattr(provider_class, "__module__", ""))
        if not provider_module.startswith("yt_dlp_plugins."):
            raise RuntimeError(
                f"Registered provider came from an unexpected module: {provider_module!r}"
            )

        distribution_version = importlib.metadata.version(_DISTRIBUTION_NAME)
        provider_version = str(getattr(provider_class, "PROVIDER_VERSION", ""))
        if not provider_version or provider_version != distribution_version:
            raise RuntimeError(
                "Provider/package version mismatch: "
                f"provider={provider_version!r}, package={distribution_version!r}"
            )

        provider_instance = provider_class.__new__(provider_class)
        if not provider_class.is_available(provider_instance):
            raise RuntimeError(
                f"JS Challenge Provider {_EXPECTED_PROVIDER_NAME!r} reports unavailable"
            )

        _probe_webkit_access()

        return {
            "success": True,
            "provider": str(provider_class.PROVIDER_NAME),
            "version": distribution_version,
        }
    except BaseException as error:
        diagnostics = _diagnostics(discovery_directories)
        diagnostic_text = json.dumps(diagnostics, ensure_ascii=False, indent=2)
        print(
            "AuraMusic Apple WebKit provider diagnostics:\n" + diagnostic_text,
            file=sys.stderr,
            flush=True,
        )
        raise AuraYtDlpAppleProviderError(
            "Apple WebKit provider validation failed\n"
            f"exception_type={type(error).__name__}\n"
            f"exception_message={error}\n"
            f"diagnostics={diagnostic_text}"
        ) from error
