import ExpoModulesCore
import Foundation

private struct AuraPythonRuntimeError: Error, LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
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
  }
}
