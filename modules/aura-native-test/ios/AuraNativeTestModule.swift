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

private struct AuraYouTubeAudioFormatPayload: Decodable {
  let formatId: String
  let ext: String?
  let audioCodec: String?
  let bitrate: Double?
  let fileSize: Double?
}

private struct AuraYouTubeVideoInfoPayload: Decodable {
  let id: String
  let title: String
  let uploader: String?
  let duration: Double?
  let thumbnail: String?
  let webpageUrl: String
  let audioFormats: [AuraYouTubeAudioFormatPayload]
  let hasM4aAudio: Bool
  let preferredM4aFormatId: String?
}

private struct AuraYouTubeErrorPayload: Decodable {
  let code: String
  let message: String
}

private struct AuraYouTubeEnvelope: Decodable {
  let ok: Bool
  let data: AuraYouTubeVideoInfoPayload?
  let error: AuraYouTubeErrorPayload?
}

private struct AuraYouTubeAudioFormatResult: Record {
  @Field var formatId: String = ""
  @Field var ext: String?
  @Field var audioCodec: String?
  @Field var bitrate: Double?
  @Field var fileSize: Double?
}

private struct AuraYouTubeVideoInfoResult: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var uploader: String?
  @Field var duration: Double?
  @Field var thumbnail: String?
  @Field var webpageUrl: String = ""
  @Field var audioFormats: [AuraYouTubeAudioFormatResult] = []
  @Field var hasM4aAudio: Bool = false
  @Field var preferredM4aFormatId: String?
}

private func makeAudioFormatResult(
  from payload: AuraYouTubeAudioFormatPayload
) -> AuraYouTubeAudioFormatResult {
  var result = AuraYouTubeAudioFormatResult()
  result.formatId = payload.formatId
  result.ext = payload.ext
  result.audioCodec = payload.audioCodec
  result.bitrate = payload.bitrate
  result.fileSize = payload.fileSize
  return result
}

private func makeVideoInfoResult(
  from payload: AuraYouTubeVideoInfoPayload
) -> AuraYouTubeVideoInfoResult {
  var result = AuraYouTubeVideoInfoResult()
  result.id = payload.id
  result.title = payload.title
  result.uploader = payload.uploader
  result.duration = payload.duration
  result.thumbnail = payload.thumbnail
  result.webpageUrl = payload.webpageUrl
  result.audioFormats = payload.audioFormats.map(makeAudioFormatResult)
  result.hasM4aAudio = payload.hasM4aAudio
  result.preferredM4aFormatId = payload.preferredM4aFormatId
  return result
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

    // Expo runs AsyncFunction bodies on its user-initiated worker queue by
    // default, so the synchronous CPython/yt-dlp work never blocks iOS main.
    AsyncFunction("extractYouTubeInfo") { (url: String) throws -> AuraYouTubeVideoInfoResult in
      var pythonError: NSString?
      guard let json = AuraExtractYouTubeInfo(url, &pythonError) else {
        throw Exception(
          name: "NATIVE_BRIDGE_ERROR",
          description: pythonError.map { $0 as String }
            ?? "Estrazione metadata YouTube fallita senza dettagli.",
          code: "NATIVE_BRIDGE_ERROR"
        )
      }

      let envelope: AuraYouTubeEnvelope
      do {
        envelope = try JSONDecoder().decode(
          AuraYouTubeEnvelope.self,
          from: Data((json as String).utf8)
        )
      } catch {
        throw Exception(
          name: "INVALID_NATIVE_RESPONSE",
          description: "Il bridge Python ha restituito un risultato non valido.",
          code: "INVALID_NATIVE_RESPONSE"
        )
      }

      if envelope.ok, let payload = envelope.data {
        return makeVideoInfoResult(from: payload)
      }

      let extractionError = envelope.error
      throw Exception(
        name: extractionError?.code ?? "EXTRACTION_ERROR",
        description: extractionError?.message
          ?? "Estrazione metadata YouTube fallita senza dettagli.",
        code: extractionError?.code ?? "EXTRACTION_ERROR"
      )
    }
  }
}
