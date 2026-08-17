Pod::Spec.new do |s|
  s.name           = 'AuraNativeTest'
  s.version        = '1.0.0'
  s.summary        = 'Native bridge and embedded CPython proof of concept for AuraMusic'
  s.description    = 'Validates TypeScript to Swift calls and a minimal embedded CPython runtime.'
  s.author         = 'AuraMusic'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.vendored_frameworks = 'Python.xcframework'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER' => 'NO',
  }

  s.source_files = '*.swift', 'AuraPythonBridge.{h,m}'
  s.public_header_files = 'AuraPythonBridge.h'
end
