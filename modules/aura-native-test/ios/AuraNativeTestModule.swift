import ExpoModulesCore
import Foundation

private struct AuraPythonRuntimeError: Error, LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}

private struct AuraYtDlpImportResult: Record {
  @Field var success: Bool = true
  @Field var version: String = ""
}

private struct AuraYtDlpAppleProviderResult: Record {
  @Field var success: Bool = false
  @Field var provider: String = ""
  @Field var version: String = ""
}

public class AuraNativeTestModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AuraNativeTest")

    AsyncFunction("getNativeMessage") {
      return "Hello from native iOS"
    }

    AsyncFunction("testPython") { () throws -> Int in
      var pythonError: NSString?
      let result = AuraTestPython(&pythonError)

      if let pythonError {
        throw AuraPythonRuntimeError(message: pythonError as String)
      }

      return result
    }

    AsyncFunction("testYtDlpImport") { () throws -> AuraYtDlpImportResult in
      var pythonError: NSString?
      guard let version = AuraTestYtDlpImport(&pythonError) else {
        let message = pythonError.map { $0 as String }
          ?? "Import yt-dlp fallito senza dettagli."
        throw AuraPythonRuntimeError(
          message: message
        )
      }

      var result = AuraYtDlpImportResult()
      result.version = version as String
      return result
    }

    AsyncFunction("testYtDlpAppleProvider") { () throws -> AuraYtDlpAppleProviderResult in
      var success = 0
      var providerName: NSString?
      var version: NSString?
      var pythonError: NSString?

      guard AuraTestYtDlpAppleProvider(&success, &providerName, &version, &pythonError),
            let providerName,
            let version else {
        throw AuraPythonRuntimeError(
          message: pythonError.map { $0 as String }
            ?? "Test del provider Apple WebKit fallito senza dettagli."
        )
      }

      var result = AuraYtDlpAppleProviderResult()
      result.success = success != 0
      result.provider = providerName as String
      result.version = version as String
      return result
    }
  }
}
