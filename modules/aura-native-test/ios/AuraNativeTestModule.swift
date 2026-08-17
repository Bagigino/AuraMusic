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
  }
}
