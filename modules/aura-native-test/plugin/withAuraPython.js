const fs = require('node:fs');
const path = require('node:path');

const { IOSConfig, withXcodeProject } = require('@expo/config-plugins');

const BUILD_PHASE_NAME = 'Install embedded CPython';
const FRAMEWORK_RELATIVE_TO_IOS = '../modules/aura-native-test/ios/Python.xcframework';
const PYTHON_APP_RELATIVE_TO_IOS = '../modules/aura-native-test/python';
const PYTHON_VENDOR_RELATIVE_TO_IOS = '../modules/aura-native-test/python-vendor';

const BUILD_PHASE_SCRIPT = `set -e

PYTHON_XCFRAMEWORK_PATH="${FRAMEWORK_RELATIVE_TO_IOS}"
PYTHON_APP_PATH="$PROJECT_DIR/${PYTHON_APP_RELATIVE_TO_IOS}"
PYTHON_VENDOR_PATH="$PROJECT_DIR/${PYTHON_VENDOR_RELATIVE_TO_IOS}"

test -d "$PROJECT_DIR/$PYTHON_XCFRAMEWORK_PATH" || {
  echo "error: Python.xcframework is missing. Prepare CPython before building iOS."
  exit 1
}

test -f "$PYTHON_APP_PATH/aura_test.py" || {
  echo "error: aura_test.py is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_APP_PATH/aura_yt_dlp_apple_provider.py" || {
  echo "error: aura_yt_dlp_apple_provider.py is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_APP_PATH/aura_youtube_metadata.py" || {
  echo "error: aura_youtube_metadata.py is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_VENDOR_PATH/yt_dlp/__init__.py" || {
  echo "error: Vendored yt_dlp package is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_VENDOR_PATH/yt_dlp/version.py" || {
  echo "error: Vendored yt_dlp version module is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_VENDOR_PATH/yt_dlp_plugins/extractor/ytjsc.py" || {
  echo "error: Vendored Apple WebKit provider is missing from the local Expo module."
  exit 1
}

test -f "$PYTHON_VENDOR_PATH/certifi/cacert.pem" || {
  echo "error: Vendored certifi CA bundle is missing from the local Expo module."
  exit 1
}

rm -rf "$CODESIGNING_FOLDER_PATH/app"
mkdir -p "$CODESIGNING_FOLDER_PATH/app"
rsync -a "$PYTHON_APP_PATH/" "$CODESIGNING_FOLDER_PATH/app/"

rm -rf "$CODESIGNING_FOLDER_PATH/python-vendor"
mkdir -p "$CODESIGNING_FOLDER_PATH/python-vendor"
rsync -a "$PYTHON_VENDOR_PATH/" "$CODESIGNING_FOLDER_PATH/python-vendor/"

source "$PROJECT_DIR/$PYTHON_XCFRAMEWORK_PATH/build/utils.sh"
# The official CPython helper signs generated extension frameworks. In an
# otherwise unsigned build, use only an ad-hoc identity; Sideloadly will later
# replace it together with the app signature.
export EXPANDED_CODE_SIGN_IDENTITY="\${EXPANDED_CODE_SIGN_IDENTITY:--}"
install_python "$PYTHON_XCFRAMEWORK_PATH" app python-vendor
`;

function findApplicationTarget(project, projectName) {
  const nativeTargets = project.pbxNativeTargetSection();
  for (const [uuid, target] of Object.entries(nativeTargets)) {
    if (uuid.endsWith('_comment') || typeof target !== 'object') {
      continue;
    }

    if (target.productType === '"com.apple.product-type.application"' && target.name === projectName) {
      return [uuid, target];
    }
  }

  const firstTarget = project.getFirstTarget();
  return [firstTarget.uuid, firstTarget.firstTarget];
}

function setRequiredBuildSettings(project, target) {
  const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
    project,
    target.buildConfigurationList,
  );

  for (const [, configuration] of configurations) {
    if (!configuration?.buildSettings) {
      continue;
    }

    configuration.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    configuration.buildSettings.ENABLE_TESTABILITY = 'YES';
    configuration.buildSettings.CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = 'NO';
  }
}

function addPythonBuildPhase(project, targetUuid, target) {
  const existingPhase = target.buildPhases.find((phase) => phase.comment === BUILD_PHASE_NAME);
  if (existingPhase) {
    return;
  }

  const addedPhase = project.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    BUILD_PHASE_NAME,
    targetUuid,
    {
      inputPaths: [],
      outputPaths: [],
      shellPath: '/bin/sh',
      shellScript: BUILD_PHASE_SCRIPT,
    },
  );

  addedPhase.buildPhase.alwaysOutOfDate = 1;
  addedPhase.buildPhase.showEnvVarsInLog = 0;

  const insertedPhase = target.buildPhases.pop();
  const resourcesIndex = target.buildPhases.findIndex((phase) => {
    const resourcePhases = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
    return resourcePhases[phase.value] != null;
  });

  target.buildPhases.splice(resourcesIndex >= 0 ? resourcesIndex + 1 : target.buildPhases.length, 0, insertedPhase);
}

module.exports = function withAuraPython(config) {
  return withXcodeProject(config, (modConfig) => {
    const frameworkPath = path.join(
      modConfig.modRequest.projectRoot,
      'modules',
      'aura-native-test',
      'ios',
      'Python.xcframework',
    );

    if (!fs.existsSync(frameworkPath)) {
      throw new Error(
        `AuraNativeTest requires Python.xcframework before iOS prebuild. Missing: ${frameworkPath}`,
      );
    }

    const ytDlpVersionPath = path.join(
      modConfig.modRequest.projectRoot,
      'modules',
      'aura-native-test',
      'python-vendor',
      'yt_dlp',
      'version.py',
    );

    if (!fs.existsSync(ytDlpVersionPath)) {
      throw new Error(
        `AuraNativeTest requires vendored yt-dlp before iOS prebuild. Missing: ${ytDlpVersionPath}`,
      );
    }

    const appleProviderPath = path.join(
      modConfig.modRequest.projectRoot,
      'modules',
      'aura-native-test',
      'python-vendor',
      'yt_dlp_plugins',
      'extractor',
      'ytjsc.py',
    );

    if (!fs.existsSync(appleProviderPath)) {
      throw new Error(
        `AuraNativeTest requires the vendored Apple WebKit provider before iOS prebuild. Missing: ${appleProviderPath}`,
      );
    }

    const certifiCaPath = path.join(
      modConfig.modRequest.projectRoot,
      'modules',
      'aura-native-test',
      'python-vendor',
      'certifi',
      'cacert.pem',
    );

    if (!fs.existsSync(certifiCaPath)) {
      throw new Error(
        `AuraNativeTest requires the vendored certifi CA bundle before iOS prebuild. Missing: ${certifiCaPath}`,
      );
    }

    const projectName = modConfig.modRequest.projectName;
    const [targetUuid, target] = findApplicationTarget(modConfig.modResults, projectName);
    setRequiredBuildSettings(modConfig.modResults, target);
    addPythonBuildPhase(modConfig.modResults, targetUuid, target);

    return modConfig;
  });
};
