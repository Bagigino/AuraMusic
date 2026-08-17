#!/usr/bin/env bash

set -euo pipefail

CPYTHON_VERSION="${CPYTHON_VERSION:-3.14.7}"
CPYTHON_SOURCE_SHA256="${CPYTHON_SOURCE_SHA256:-3b48dac8fb59f62eaa67ac83c1eb12bda1b7a08406dd286e252c11a66be27f81}"
IOS_DEPLOYMENT_TARGET="${IOS_DEPLOYMENT_TARGET:-16.4}"

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <work-directory> <output-Python.xcframework>" >&2
  exit 2
fi

WORK_DIRECTORY="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUTPUT_XCFRAMEWORK="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"

if [[ -e "$WORK_DIRECTORY" || -e "$OUTPUT_XCFRAMEWORK" ]]; then
  echo "The CPython work directory and XCFramework output must not already exist." >&2
  echo "Work: $WORK_DIRECTORY" >&2
  echo "Output: $OUTPUT_XCFRAMEWORK" >&2
  exit 1
fi

mkdir -p "$WORK_DIRECTORY" "$(dirname "$OUTPUT_XCFRAMEWORK")"

ARCHIVE="$WORK_DIRECTORY/Python-$CPYTHON_VERSION.tar.xz"
SOURCE_DIRECTORY="$WORK_DIRECTORY/Python-$CPYTHON_VERSION"
HOST_BUILD_DIRECTORY="$WORK_DIRECTORY/host-build"
HOST_TOOL_DIRECTORY="$WORK_DIRECTORY/host-tools"
DEVICE_BUILD_DIRECTORY="$WORK_DIRECTORY/arm64-apple-ios-build"
DEVICE_INSTALL_DIRECTORY="$WORK_DIRECTORY/arm64-apple-ios-install"

echo "Downloading official CPython $CPYTHON_VERSION source release from python.org"
curl -fL --retry 5 --retry-all-errors \
  "https://www.python.org/ftp/python/$CPYTHON_VERSION/Python-$CPYTHON_VERSION.tar.xz" \
  -o "$ARCHIVE"

echo "$CPYTHON_SOURCE_SHA256  $ARCHIVE" | shasum -a 256 --check
tar -xf "$ARCHIVE" -C "$WORK_DIRECTORY"

JOBS="$(sysctl -n hw.ncpu)"

echo "Building the same CPython source for the macOS build interpreter"
mkdir -p "$HOST_BUILD_DIRECTORY"
(
  cd "$HOST_BUILD_DIRECTORY"
  "$SOURCE_DIRECTORY/configure" \
    --without-ensurepip \
    --disable-test-modules
  make -j "$JOBS"
)

test -x "$HOST_BUILD_DIRECTORY/python" || {
  echo "The host CPython build interpreter was not generated." >&2
  exit 1
}

BUILD_TRIPLE="$($SOURCE_DIRECTORY/config.guess)"
IOS_TOOL_PATH="$SOURCE_DIRECTORY/Apple/iOS/Resources/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Library/Apple/usr/bin"
mkdir -p "$HOST_TOOL_DIRECTORY"
ln -s "$HOST_BUILD_DIRECTORY/python" "$HOST_TOOL_DIRECTORY/python3.14"
CROSS_BUILD_PATH="$HOST_TOOL_DIRECTORY:$IOS_TOOL_PATH"

# CPython's cross-configure validates --with-build-python with `command -v`.
# Expose the freshly built interpreter as a command on the same restricted PATH
# used for the iOS build, then verify both command resolution and its version.
PATH="$CROSS_BUILD_PATH" command -v python3.14 >/dev/null || {
  echo "The host CPython build interpreter is not resolvable as python3.14." >&2
  exit 1
}

HOST_PYTHON_VERSION="$(PATH="$CROSS_BUILD_PATH" python3.14 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ "$HOST_PYTHON_VERSION" != "3.14" ]]; then
  echo "The host build interpreter has version $HOST_PYTHON_VERSION; expected 3.14." >&2
  exit 1
fi

echo "Cross-compiling a dependency-minimal CPython framework for arm64 iPhone devices"
mkdir -p "$DEVICE_BUILD_DIRECTORY"
(
  cd "$DEVICE_BUILD_DIRECTORY"
  PATH="$CROSS_BUILD_PATH" \
  IPHONEOS_DEPLOYMENT_TARGET="$IOS_DEPLOYMENT_TARGET" \
  CC=arm64-apple-ios-clang \
  CXX=arm64-apple-ios-clang++ \
  CPP=arm64-apple-ios-cpp \
  AR=arm64-apple-ios-ar \
  STRIP=arm64-apple-ios-strip \
  "$SOURCE_DIRECTORY/configure" \
    "--host=arm64-apple-ios$IOS_DEPLOYMENT_TARGET" \
    "--build=$BUILD_TRIPLE" \
    --with-build-python=python3.14 \
    "--enable-framework=$DEVICE_INSTALL_DIRECTORY" \
    --without-ensurepip \
    --disable-test-modules

  PATH="$CROSS_BUILD_PATH" make -j "$JOBS"
  PATH="$CROSS_BUILD_PATH" make install
)

PYTHON_FRAMEWORK="$DEVICE_INSTALL_DIRECTORY/Python.framework"
test -f "$PYTHON_FRAMEWORK/Python" || {
  echo "The arm64 Python.framework binary was not generated at $PYTHON_FRAMEWORK." >&2
  find "$DEVICE_INSTALL_DIRECTORY" -maxdepth 3 -print >&2 || true
  exit 1
}

test -d "$DEVICE_INSTALL_DIRECTORY/lib/python3.14/encodings" || {
  echo "The CPython standard library was not installed." >&2
  exit 1
}

echo "Creating the device-only Python.xcframework"
xcodebuild -create-xcframework \
  -framework "$PYTHON_FRAMEWORK" \
  -output "$OUTPUT_XCFRAMEWORK"

XCFRAMEWORK_SLICE="$(find "$OUTPUT_XCFRAMEWORK" -mindepth 1 -maxdepth 1 -type d -name 'ios-arm64*' -print -quit)"
test -n "$XCFRAMEWORK_SLICE" || {
  echo "The iOS arm64 XCFramework slice was not generated." >&2
  exit 1
}

# iOS frameworks cannot contain the standard library. Keep it beside the
# framework slice, matching the layout consumed by CPython's official Xcode
# install helper. Binary stdlib extensions are intentionally omitted in this
# dependency-minimal 2 + 2 proof of concept.
cp -R "$DEVICE_INSTALL_DIRECTORY/lib" "$XCFRAMEWORK_SLICE/lib"
find "$XCFRAMEWORK_SLICE/lib" -type f -name '*.so' -delete
mkdir -p "$XCFRAMEWORK_SLICE/lib/python3.14/lib-dynload"

mkdir -p "$OUTPUT_XCFRAMEWORK/build"
cp "$SOURCE_DIRECTORY/Apple/testbed/Python.xcframework/build/utils.sh" \
  "$OUTPUT_XCFRAMEWORK/build/utils.sh"
cp "$SOURCE_DIRECTORY/Apple/testbed/Python.xcframework/build/iOS-dylib-Info-template.plist" \
  "$OUTPUT_XCFRAMEWORK/build/iOS-dylib-Info-template.plist"

test -f "$OUTPUT_XCFRAMEWORK/build/utils.sh"
test -f "$XCFRAMEWORK_SLICE/lib/python3.14/encodings/__init__.py"
lipo -info "$XCFRAMEWORK_SLICE/Python.framework/Python"

echo "CPython $CPYTHON_VERSION iOS XCFramework created at $OUTPUT_XCFRAMEWORK"
