import ExpoModulesCore

public class AuraNativeTestModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AuraNativeTest")

    AsyncFunction("getNativeMessage") {
      return "Hello from native iOS"
    }
  }
}
