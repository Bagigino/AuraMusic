import ExpoModulesCore
import Foundation

private struct AuraPythonRuntimeError: Error, LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}

private final class AuraNativeModuleException: Exception, @unchecked Sendable {
  private let nativeReason: String

  override var reason: String {
    nativeReason
  }

  override init(
    name: String,
    description: String,
    code: String? = nil,
    file: String = #fileID,
    line: UInt = #line,
    function: String = #function
  ) {
    nativeReason = description
    super.init(
      name: name,
      description: description,
      code: code,
      file: file,
      line: line,
      function: function
    )
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

private struct AuraYouTubeSearchResultPayload: Decodable {
  let id: String
  let title: String
  let uploader: String?
  let duration: Double?
  let thumbnail: String?
  let url: String
}

private struct AuraYouTubeSearchEnvelope: Decodable {
  let ok: Bool
  let data: [AuraYouTubeSearchResultPayload]?
  let error: AuraYouTubeErrorPayload?
}

private struct AuraDownloadedAudioPayload: Decodable {
  let success: Bool
  let alreadyExists: Bool?
  let videoId: String
  let title: String
  let formatId: String
  let ext: String
  let localPath: String
  let fileSize: Double?
}

private struct AuraDownloadEnvelope: Decodable {
  let ok: Bool
  let data: AuraDownloadedAudioPayload?
  let error: AuraYouTubeErrorPayload?
}

private struct AuraDownloadProgressPayload: Decodable {
  let status: String
  let downloadedBytes: Double?
  let totalBytes: Double?
  let totalBytesEstimate: Double?
  let speed: Double?
  let eta: Double?
  let progress: Double?
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

private struct AuraYouTubeSearchResult: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var uploader: String?
  @Field var duration: Double?
  @Field var thumbnail: String?
  @Field var url: String = ""
}

private struct AuraDownloadedAudioResult: Record {
  @Field var success: Bool = true
  @Field var alreadyExists: Bool = false
  @Field var videoId: String = ""
  @Field var title: String = ""
  @Field var formatId: String = ""
  @Field var ext: String = "m4a"
  @Field var localPath: String = ""
  @Field var localUri: String = ""
  @Field var fileSize: Double?
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

private func makeSearchResult(
  from payload: AuraYouTubeSearchResultPayload
) -> AuraYouTubeSearchResult {
  var result = AuraYouTubeSearchResult()
  result.id = payload.id
  result.title = payload.title
  result.uploader = payload.uploader
  result.duration = payload.duration
  result.thumbnail = payload.thumbnail
  result.url = payload.url
  return result
}

private func prepareMusicDirectory(
  fileManager: FileManager,
  documentsDirectory: URL
) throws -> URL {
  let musicDirectory = documentsDirectory.appendingPathComponent(
    "music",
    isDirectory: true
  )
  try fileManager.createDirectory(
    at: musicDirectory,
    withIntermediateDirectories: true,
    attributes: nil
  )

  let legacyDirectory = documentsDirectory.appendingPathComponent(
    "music-downloads",
    isDirectory: true
  )
  var isLegacyDirectory: ObjCBool = false
  guard fileManager.fileExists(
    atPath: legacyDirectory.path,
    isDirectory: &isLegacyDirectory
  ), isLegacyDirectory.boolValue else {
    return musicDirectory
  }

  let legacyFiles = try fileManager.contentsOfDirectory(
    at: legacyDirectory,
    includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
    options: [.skipsHiddenFiles]
  )
  for sourceURL in legacyFiles where sourceURL.pathExtension.lowercased() == "m4a" {
    guard let values = try? sourceURL.resourceValues(
      forKeys: [.isRegularFileKey, .fileSizeKey]
    ), values.isRegularFile == true, (values.fileSize ?? 0) > 0 else {
      continue
    }

    let destinationURL = musicDirectory.appendingPathComponent(
      sourceURL.lastPathComponent,
      isDirectory: false
    )
    guard !fileManager.fileExists(atPath: destinationURL.path) else {
      continue
    }

    do {
      try fileManager.moveItem(at: sourceURL, to: destinationURL)
      NSLog("AuraMusic migrated legacy M4A: %@", sourceURL.lastPathComponent)
    } catch {
      NSLog(
        "AuraMusic could not migrate legacy M4A %@: %@",
        sourceURL.lastPathComponent,
        error.localizedDescription
      )
    }
  }
  return musicDirectory
}

public class AuraNativeTestModule: Module {
  private let downloadStateLock = NSLock()
  private var downloadIsActive = false

  private func beginDownload() -> Bool {
    downloadStateLock.lock()
    defer { downloadStateLock.unlock() }
    guard !downloadIsActive else {
      return false
    }
    downloadIsActive = true
    return true
  }

  private func finishDownload() {
    downloadStateLock.lock()
    downloadIsActive = false
    downloadStateLock.unlock()
  }

  public func definition() -> ModuleDefinition {
    Name("AuraNativeTest")
    Events("onDownloadProgress")

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
    AsyncFunction("searchYouTube") {
      (query: String, limit: Int?) throws -> [AuraYouTubeSearchResult] in
      let resolvedLimit = min(max(limit ?? 10, 1), 20)
      var pythonError: NSString?
      guard let json = AuraSearchYouTube(query, resolvedLimit, &pythonError) else {
        throw AuraNativeModuleException(
          name: "NATIVE_BRIDGE_ERROR",
          description: pythonError.map { $0 as String }
            ?? "Ricerca YouTube fallita senza dettagli.",
          code: "NATIVE_BRIDGE_ERROR"
        )
      }

      let envelope: AuraYouTubeSearchEnvelope
      do {
        envelope = try JSONDecoder().decode(
          AuraYouTubeSearchEnvelope.self,
          from: Data((json as String).utf8)
        )
      } catch {
        throw AuraNativeModuleException(
          name: "INVALID_NATIVE_RESPONSE",
          description: "Il bridge Python ha restituito risultati di ricerca non validi.",
          code: "INVALID_NATIVE_RESPONSE"
        )
      }

      if envelope.ok, let payload = envelope.data {
        return payload.map(makeSearchResult)
      }

      let searchError = envelope.error
      throw AuraNativeModuleException(
        name: searchError?.code ?? "SEARCH_ERROR",
        description: searchError?.message
          ?? "Ricerca YouTube fallita senza dettagli.",
        code: searchError?.code ?? "SEARCH_ERROR"
      )
    }

    AsyncFunction("extractYouTubeInfo") { (url: String) throws -> AuraYouTubeVideoInfoResult in
      var pythonError: NSString?
      guard let json = AuraExtractYouTubeInfo(url, &pythonError) else {
        throw AuraNativeModuleException(
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
        throw AuraNativeModuleException(
          name: "INVALID_NATIVE_RESPONSE",
          description: "Il bridge Python ha restituito un risultato non valido.",
          code: "INVALID_NATIVE_RESPONSE"
        )
      }

      if envelope.ok, let payload = envelope.data {
        return makeVideoInfoResult(from: payload)
      }

      let extractionError = envelope.error
      throw AuraNativeModuleException(
        name: extractionError?.code ?? "EXTRACTION_ERROR",
        description: extractionError?.message
          ?? "Estrazione metadata YouTube fallita senza dettagli.",
        code: extractionError?.code ?? "EXTRACTION_ERROR"
      )
    }

    AsyncFunction("downloadYouTubeM4a") {
      (url: String, formatId: String?) throws -> AuraDownloadedAudioResult in
      guard self.beginDownload() else {
        throw AuraNativeModuleException(
          name: "DOWNLOAD_IN_PROGRESS",
          description: "Un download M4A e gia in corso.",
          code: "DOWNLOAD_IN_PROGRESS"
        )
      }
      defer { self.finishDownload() }

      let fileManager = FileManager.default
      guard let documentsDirectory = fileManager.urls(
        for: .documentDirectory,
        in: .userDomainMask
      ).first else {
        throw AuraNativeModuleException(
          name: "FILESYSTEM_ERROR",
          description: "La directory Documents dell'app non e disponibile.",
          code: "FILESYSTEM_ERROR"
        )
      }

      let downloadDirectory: URL
      do {
        downloadDirectory = try prepareMusicDirectory(
          fileManager: fileManager,
          documentsDirectory: documentsDirectory
        )
      } catch {
        let nsError = error as NSError
        let code = nsError.code == NSFileWriteOutOfSpaceError
          ? "DISK_FULL"
          : "FILESYSTEM_ERROR"
        throw AuraNativeModuleException(
          name: code,
          description: code == "DISK_FULL"
            ? "Spazio insufficiente per creare la directory di download."
            : "Impossibile preparare Documents/music.",
          code: code
        )
      }

      let progressHandler: AuraDownloadProgressHandler = { [weak self] progressJSON in
        guard let payload = try? JSONDecoder().decode(
          AuraDownloadProgressPayload.self,
          from: Data((progressJSON as String).utf8)
        ) else {
          return
        }
        self?.sendEvent("onDownloadProgress", [
          "status": payload.status,
          "downloadedBytes": payload.downloadedBytes,
          "totalBytes": payload.totalBytes,
          "totalBytesEstimate": payload.totalBytesEstimate,
          "speed": payload.speed,
          "eta": payload.eta,
          "progress": payload.progress,
        ])
      }

      var pythonError: NSString?
      guard let json = AuraDownloadYouTubeM4a(
        url,
        formatId,
        downloadDirectory.path,
        progressHandler,
        &pythonError
      ) else {
        throw AuraNativeModuleException(
          name: "NATIVE_BRIDGE_ERROR",
          description: pythonError.map { $0 as String }
            ?? "Download M4A fallito senza dettagli.",
          code: "NATIVE_BRIDGE_ERROR"
        )
      }

      let envelope: AuraDownloadEnvelope
      do {
        envelope = try JSONDecoder().decode(
          AuraDownloadEnvelope.self,
          from: Data((json as String).utf8)
        )
      } catch {
        throw AuraNativeModuleException(
          name: "INVALID_NATIVE_RESPONSE",
          description: "Il bridge Python ha restituito un risultato download non valido.",
          code: "INVALID_NATIVE_RESPONSE"
        )
      }

      guard envelope.ok, let payload = envelope.data else {
        let downloadError = envelope.error
        throw AuraNativeModuleException(
          name: downloadError?.code ?? "DOWNLOAD_ERROR",
          description: downloadError?.message
            ?? "Download M4A fallito senza dettagli.",
          code: downloadError?.code ?? "DOWNLOAD_ERROR"
        )
      }

      let resolvedDownloadDirectory = downloadDirectory
        .resolvingSymlinksInPath()
        .standardizedFileURL
      let outputURL = URL(fileURLWithPath: payload.localPath)
        .resolvingSymlinksInPath()
        .standardizedFileURL
      guard payload.success,
            payload.ext.lowercased() == "m4a",
            outputURL.deletingLastPathComponent() == resolvedDownloadDirectory,
            outputURL.lastPathComponent == "\(payload.videoId).m4a" else {
        throw AuraNativeModuleException(
          name: "INVALID_NATIVE_RESPONSE",
          description: "Il percorso M4A restituito dal runtime non e valido.",
          code: "INVALID_NATIVE_RESPONSE"
        )
      }

      let attributes: [FileAttributeKey: Any]
      do {
        attributes = try fileManager.attributesOfItem(atPath: outputURL.path)
      } catch {
        throw AuraNativeModuleException(
          name: "FILESYSTEM_ERROR",
          description: "Il file M4A finale non e accessibile.",
          code: "FILESYSTEM_ERROR"
        )
      }
      let fileType = attributes[.type] as? FileAttributeType
      let verifiedSize = (attributes[.size] as? NSNumber)?.doubleValue ?? 0
      guard fileType == .typeRegular, verifiedSize > 0 else {
        throw AuraNativeModuleException(
          name: "FILESYSTEM_ERROR",
          description: "Il file M4A finale non e un file regolare non vuoto.",
          code: "FILESYSTEM_ERROR"
        )
      }

      var result = AuraDownloadedAudioResult()
      result.alreadyExists = payload.alreadyExists ?? false
      result.videoId = payload.videoId
      result.title = payload.title
      result.formatId = payload.formatId
      result.localPath = outputURL.path
      result.localUri = outputURL.absoluteString
      result.fileSize = verifiedSize
      return result
    }
  }
}
