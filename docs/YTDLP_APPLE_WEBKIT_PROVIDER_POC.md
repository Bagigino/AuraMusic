# Apple WebKit JS Challenge Provider POC

This proof of concept validates the following offline chain on a physical iPhone:

`TypeScript -> Expo module -> Swift -> embedded CPython -> yt-dlp plugin discovery -> Apple WebKit provider`

It deliberately does not extract a YouTube URL, download player JavaScript, execute a challenge, or download media.

## Pinned packages

- `yt-dlp==2026.07.04`
- `yt-dlp-apple-webkit-jsi==0.1.1`

GitHub Actions installs both packages into `modules/aura-native-test/python-vendor` with `pip --target --no-compile --no-deps`. Nothing is installed at runtime on the iPhone. The provider distribution declares no additional Python dependencies.

The provider is stored under the implicit namespace package `yt_dlp_plugins`, principally at:

- `python-vendor/yt_dlp_plugins/extractor/ytjsc.py`
- `python-vendor/yt_dlp_plugins/extractor/webkit_jsi.py`
- `python-vendor/yt_dlp_plugins/webkit_jsi/lib/`

The existing Expo config plugin copies the complete vendor directory into `AuraMusic.app/python-vendor`. That path is already included in the isolated embedded interpreter's `sys.path`.

## Registration test

`aura_yt_dlp_apple_provider.test_apple_webkit_provider()` imports yt-dlp, registers the normal extractor plugin specification, and calls `yt_dlp.plugins.load_all_plugins()` once. It then verifies all of the following:

1. the `yt_dlp_plugins` namespace has discovery locations;
2. normal discovery loaded `yt_dlp_plugins.extractor.ytjsc`;
3. yt-dlp's JS Challenge Provider registry contains a provider named `apple-webkit-jsi`;
4. the registered class comes from `yt_dlp_plugins`;
5. its provider version matches the installed distribution metadata;
6. the provider reports available on the device;
7. the plugin's own loader can open the system WebKit framework and resolve `WKWebView`.

yt-dlp exposes public provider registration decorators but no public provider-enumeration API in the pinned version. The test therefore reads its internal JSC registry only for verification. Keeping yt-dlp pinned makes that deliberate compatibility boundary explicit.

## WebKit access

Release 0.1.1 is pure Python. It uses `ctypes`/`dlopen` to open `/System/Library/Frameworks/WebKit.framework/WebKit`; it does not require a CocoaPods or link-time framework declaration. No podspec or generated `ios/` file is changed for WebKit.

The offline probe uses that same plugin loader. It does not instantiate `WKWebView`, load a page, execute JavaScript, or contact the network.

## Device and web behavior

The debug button **Test Apple WebKit provider** calls the same long-lived CPython interpreter used by the existing Python and yt-dlp import tests. Success is shown as:

`Apple WebKit provider ready: 0.1.1`

On web, the TypeScript fallback returns:

`Apple WebKit provider unavailable on web`

If validation fails on iOS, the Python traceback is written to the system log and the rejected promise contains the exception type, message, `sys.path`, plugin discovery state, imported plugin modules, and registered provider snapshot.

## CI validation

The unsigned iOS workflow verifies the exact distribution versions, namespace discovery, registry registration on the macOS host, required provider files before Prebuild, and the same files and distribution metadata inside the compiled `.app`. It also checks that the bundled provider still contains its dynamic WebKit loader.

The output remains an unsigned `AuraMusic.ipa` built with `CODE_SIGNING_ALLOWED=NO`.

This POC adds no QuickJS, Deno, Node.js, FFmpeg, `yt-dlp-ejs`, YouTube request, or media download.
