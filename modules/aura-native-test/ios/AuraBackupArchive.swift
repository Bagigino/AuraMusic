import CryptoKit
import Foundation

struct AuraBackupArchiveEntryInfo {
  let path: String
  let size: UInt64
}

struct AuraBackupFileDigest {
  let sha256: String
  let size: UInt64
}

struct AuraBackupArchiveError: Error, LocalizedError {
  let code: String
  let message: String

  var errorDescription: String? { message }
}

private struct AuraZipEntry {
  let path: String
  let pathData: Data
  let crc32: UInt32
  let size: UInt32
  let localHeaderOffset: UInt32
}

private enum AuraZip {
  static let localHeader: UInt32 = 0x04034b50
  static let centralHeader: UInt32 = 0x02014b50
  static let endOfCentralDirectory: UInt32 = 0x06054b50
  static let utf8Flag: UInt16 = 0x0800
  static let maximumEntryCount = 10_000
  static let maximumCentralDirectorySize: UInt64 = 16 * 1024 * 1024
  static let chunkSize = 1024 * 1024
}

private extension Data {
  mutating func appendLittleEndian<T: FixedWidthInteger>(_ value: T) {
    var littleEndian = value.littleEndian
    Swift.withUnsafeBytes(of: &littleEndian) { append(contentsOf: $0) }
  }

  func littleEndianUInt16(at offset: Int) throws -> UInt16 {
    guard offset >= 0, offset + 2 <= count else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Archivio ZIP troncato.")
    }
    return UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
  }

  func littleEndianUInt32(at offset: Int) throws -> UInt32 {
    guard offset >= 0, offset + 4 <= count else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Archivio ZIP troncato.")
    }
    return UInt32(self[offset])
      | (UInt32(self[offset + 1]) << 8)
      | (UInt32(self[offset + 2]) << 16)
      | (UInt32(self[offset + 3]) << 24)
  }
}

private struct AuraCRC32 {
  private static let table: [UInt32] = (0..<256).map { index in
    var value = UInt32(index)
    for _ in 0..<8 {
      value = (value & 1) == 1 ? (value >> 1) ^ 0xedb88320 : value >> 1
    }
    return value
  }

  private var value: UInt32 = 0xffffffff

  mutating func update(_ data: Data) {
    for byte in data {
      let index = Int((value ^ UInt32(byte)) & 0xff)
      value = Self.table[index] ^ (value >> 8)
    }
  }

  var final: UInt32 { value ^ 0xffffffff }
}

private func auraFileURL(_ value: String) throws -> URL {
  if let url = URL(string: value), url.isFileURL {
    return url.standardizedFileURL
  }
  if value.hasPrefix("/") {
    return URL(fileURLWithPath: value).standardizedFileURL
  }
  throw AuraBackupArchiveError(code: "UNSAFE_PATH", message: "Il percorso filesystem non e valido.")
}

private func auraSafeEntryPath(_ path: String) -> Bool {
  guard !path.isEmpty,
        !path.hasPrefix("/"),
        !path.contains("\\"),
        !path.contains(":"),
        path.unicodeScalars.allSatisfy({ $0.value >= 0x20 }) else {
    return false
  }
  let parts = path.split(separator: "/", omittingEmptySubsequences: false)
  guard parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
    return false
  }
  if path == "manifest.json" || path == "library.json" {
    return true
  }
  guard parts.count == 2, parts[0] == "music" else { return false }
  let fileName = String(parts[1])
  guard fileName.hasSuffix(".m4a") else { return false }
  let identifier = fileName.dropLast(4)
  return !identifier.isEmpty
    && identifier.count <= 200
    && identifier.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
}

private func auraReadChunks(
  from handle: FileHandle,
  byteCount: UInt64? = nil,
  consume: (Data) throws -> Void
) throws {
  var remaining = byteCount
  while remaining == nil || remaining! > 0 {
    let requested = remaining.map { min(UInt64(AuraZip.chunkSize), $0) } ?? UInt64(AuraZip.chunkSize)
    guard let chunk = try handle.read(upToCount: Int(requested)), !chunk.isEmpty else {
      if let remaining, remaining > 0 {
        throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Archivio ZIP troncato.")
      }
      break
    }
    try consume(chunk)
    if let currentRemaining = remaining {
      remaining = currentRemaining - UInt64(chunk.count)
    }
  }
}

private func auraCRCAndSize(of url: URL) throws -> (UInt32, UInt32) {
  let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
  guard values.isRegularFile == true, values.isSymbolicLink != true else {
    throw AuraBackupArchiveError(code: "UNSAFE_BACKUP_FILE", message: "Il backup puo contenere soltanto file regolari.")
  }
  let fileSize = UInt64(values.fileSize ?? 0)
  guard fileSize <= UInt64(UInt32.max) else {
    throw AuraBackupArchiveError(code: "BACKUP_TOO_LARGE", message: "Un file supera il limite ZIP supportato.")
  }
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var crc = AuraCRC32()
  try auraReadChunks(from: handle) { crc.update($0) }
  return (crc.final, UInt32(fileSize))
}

private func auraZipTimestamp(_ date: Date = Date()) -> (UInt16, UInt16) {
  let components = Calendar(identifier: .gregorian).dateComponents(
    in: TimeZone.current,
    from: date
  )
  let year = max(1980, min(2107, components.year ?? 1980))
  let month = max(1, min(12, components.month ?? 1))
  let day = max(1, min(31, components.day ?? 1))
  let hour = max(0, min(23, components.hour ?? 0))
  let minute = max(0, min(59, components.minute ?? 0))
  let second = max(0, min(59, components.second ?? 0))
  let time = UInt16((hour << 11) | (minute << 5) | (second / 2))
  let dosDate = UInt16(((year - 1980) << 9) | (month << 5) | day)
  return (time, dosDate)
}

enum AuraBackupArchive {
  static func sha256(fileValue: String) throws -> AuraBackupFileDigest {
    let url = try auraFileURL(fileValue)
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true else {
      throw AuraBackupArchiveError(code: "INVALID_BACKUP_FILE", message: "Il file da verificare non e valido.")
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    var size: UInt64 = 0
    try auraReadChunks(from: handle) { chunk in
      hasher.update(data: chunk)
      size += UInt64(chunk.count)
    }
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    return AuraBackupFileDigest(sha256: digest, size: size)
  }

  static func create(sourceDirectoryValue: String, archiveValue: String) throws -> [AuraBackupArchiveEntryInfo] {
    let fileManager = FileManager.default
    let source = try auraFileURL(sourceDirectoryValue)
    let archive = try auraFileURL(archiveValue)
    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(atPath: source.path, isDirectory: &isDirectory), isDirectory.boolValue else {
      throw AuraBackupArchiveError(code: "FILESYSTEM_ERROR", message: "La directory temporanea del backup non esiste.")
    }

    let keys: [URLResourceKey] = [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey]
    guard let enumerator = fileManager.enumerator(at: source, includingPropertiesForKeys: keys) else {
      throw AuraBackupArchiveError(code: "FILESYSTEM_ERROR", message: "Impossibile leggere i file del backup.")
    }
    var files: [(String, URL)] = []
    while let fileURL = enumerator.nextObject() as? URL {
      let values = try fileURL.resourceValues(forKeys: Set(keys))
      if values.isSymbolicLink == true {
        throw AuraBackupArchiveError(code: "UNSAFE_BACKUP_FILE", message: "Il backup non puo contenere link simbolici.")
      }
      if values.isDirectory == true { continue }
      guard values.isRegularFile == true else {
        throw AuraBackupArchiveError(code: "UNSAFE_BACKUP_FILE", message: "Il backup contiene un elemento non valido.")
      }
      let prefix = source.path.hasSuffix("/") ? source.path : source.path + "/"
      guard fileURL.path.hasPrefix(prefix) else {
        throw AuraBackupArchiveError(code: "UNSAFE_PATH", message: "Un file esce dalla directory temporanea.")
      }
      let relativePath = String(fileURL.path.dropFirst(prefix.count))
      guard auraSafeEntryPath(relativePath) else {
        throw AuraBackupArchiveError(code: "UNSAFE_ARCHIVE_ENTRY", message: "Il backup contiene un nome file non consentito.")
      }
      files.append((relativePath, fileURL))
    }
    files.sort { $0.0 < $1.0 }
    guard files.count <= AuraZip.maximumEntryCount else {
      throw AuraBackupArchiveError(code: "BACKUP_TOO_LARGE", message: "Il backup contiene troppi file.")
    }

    if fileManager.fileExists(atPath: archive.path) {
      try fileManager.removeItem(at: archive)
    }
    guard fileManager.createFile(atPath: archive.path, contents: nil) else {
      throw AuraBackupArchiveError(code: "FILESYSTEM_ERROR", message: "Impossibile creare l'archivio di backup.")
    }
    let output = try FileHandle(forWritingTo: archive)
    var writtenEntries: [AuraZipEntry] = []
    do {
      let (zipTime, zipDate) = auraZipTimestamp()
      for (path, fileURL) in files {
        guard let pathData = path.data(using: .utf8), pathData.count <= Int(UInt16.max) else {
          throw AuraBackupArchiveError(code: "UNSAFE_ARCHIVE_ENTRY", message: "Un nome file non e valido in ZIP.")
        }
        let (crc32, size) = try auraCRCAndSize(of: fileURL)
        let offset = try output.offset()
        guard offset <= UInt64(UInt32.max) else {
          throw AuraBackupArchiveError(code: "BACKUP_TOO_LARGE", message: "L'archivio supera il limite ZIP supportato.")
        }
        var header = Data()
        header.appendLittleEndian(AuraZip.localHeader)
        header.appendLittleEndian(UInt16(20))
        header.appendLittleEndian(AuraZip.utf8Flag)
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(zipTime)
        header.appendLittleEndian(zipDate)
        header.appendLittleEndian(crc32)
        header.appendLittleEndian(size)
        header.appendLittleEndian(size)
        header.appendLittleEndian(UInt16(pathData.count))
        header.appendLittleEndian(UInt16(0))
        header.append(pathData)
        try output.write(contentsOf: header)

        let input = try FileHandle(forReadingFrom: fileURL)
        do {
          try auraReadChunks(from: input) { try output.write(contentsOf: $0) }
          try input.close()
        } catch {
          try? input.close()
          throw error
        }
        writtenEntries.append(
          AuraZipEntry(path: path, pathData: pathData, crc32: crc32, size: size, localHeaderOffset: UInt32(offset))
        )
      }

      let centralOffset = try output.offset()
      guard centralOffset <= UInt64(UInt32.max) else {
        throw AuraBackupArchiveError(code: "BACKUP_TOO_LARGE", message: "L'archivio supera il limite ZIP supportato.")
      }
      let (zipTime, zipDate) = auraZipTimestamp()
      for entry in writtenEntries {
        var header = Data()
        header.appendLittleEndian(AuraZip.centralHeader)
        header.appendLittleEndian(UInt16(20))
        header.appendLittleEndian(UInt16(20))
        header.appendLittleEndian(AuraZip.utf8Flag)
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(zipTime)
        header.appendLittleEndian(zipDate)
        header.appendLittleEndian(entry.crc32)
        header.appendLittleEndian(entry.size)
        header.appendLittleEndian(entry.size)
        header.appendLittleEndian(UInt16(entry.pathData.count))
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(UInt16(0))
        header.appendLittleEndian(UInt32(0))
        header.appendLittleEndian(entry.localHeaderOffset)
        header.append(entry.pathData)
        try output.write(contentsOf: header)
      }
      let endOffset = try output.offset()
      let centralSize = endOffset - centralOffset
      guard centralSize <= UInt64(UInt32.max), writtenEntries.count <= Int(UInt16.max) else {
        throw AuraBackupArchiveError(code: "BACKUP_TOO_LARGE", message: "La directory ZIP supera i limiti supportati.")
      }
      var footer = Data()
      footer.appendLittleEndian(AuraZip.endOfCentralDirectory)
      footer.appendLittleEndian(UInt16(0))
      footer.appendLittleEndian(UInt16(0))
      footer.appendLittleEndian(UInt16(writtenEntries.count))
      footer.appendLittleEndian(UInt16(writtenEntries.count))
      footer.appendLittleEndian(UInt32(centralSize))
      footer.appendLittleEndian(UInt32(centralOffset))
      footer.appendLittleEndian(UInt16(0))
      try output.write(contentsOf: footer)
      try output.close()
    } catch {
      try? output.close()
      try? fileManager.removeItem(at: archive)
      throw error
    }
    return writtenEntries.map { AuraBackupArchiveEntryInfo(path: $0.path, size: UInt64($0.size)) }
  }

  private static func readCentralDirectory(archive: URL) throws -> ([AuraZipEntry], UInt64) {
    let handle = try FileHandle(forReadingFrom: archive)
    defer { try? handle.close() }
    let archiveSize = try handle.seekToEnd()
    guard archiveSize >= 22 else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Il file non e un archivio ZIP valido.")
    }
    let tailSize = min(archiveSize, UInt64(UInt16.max) + 22)
    try handle.seek(toOffset: archiveSize - tailSize)
    let tail = try handle.readToEnd() ?? Data()
    var endOffset: Int?
    if tail.count >= 22 {
      for offset in stride(from: tail.count - 22, through: 0, by: -1) {
        if (try? tail.littleEndianUInt32(at: offset)) == AuraZip.endOfCentralDirectory {
          endOffset = offset
          break
        }
      }
    }
    guard let endOffset else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "La directory ZIP finale e mancante.")
    }
    let diskNumber = try tail.littleEndianUInt16(at: endOffset + 4)
    let centralDisk = try tail.littleEndianUInt16(at: endOffset + 6)
    let diskEntries = try tail.littleEndianUInt16(at: endOffset + 8)
    let totalEntries = try tail.littleEndianUInt16(at: endOffset + 10)
    let centralSize = UInt64(try tail.littleEndianUInt32(at: endOffset + 12))
    let centralOffset = UInt64(try tail.littleEndianUInt32(at: endOffset + 16))
    let commentLength = Int(try tail.littleEndianUInt16(at: endOffset + 20))
    let endOfCentralDirectoryOffset = archiveSize - tailSize + UInt64(endOffset)
    guard diskNumber == 0,
          centralDisk == 0,
          diskEntries == totalEntries,
          Int(totalEntries) <= AuraZip.maximumEntryCount,
          centralSize <= AuraZip.maximumCentralDirectorySize,
          endOffset + 22 + commentLength == tail.count,
          centralOffset + centralSize == endOfCentralDirectoryOffset else {
      throw AuraBackupArchiveError(code: "UNSUPPORTED_ARCHIVE", message: "Questo tipo di archivio ZIP non e supportato.")
    }

    try handle.seek(toOffset: centralOffset)
    guard let central = try handle.read(upToCount: Int(centralSize)), central.count == Int(centralSize) else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "La directory ZIP e troncata.")
    }
    var entries: [AuraZipEntry] = []
    var cursor = 0
    for _ in 0..<Int(totalEntries) {
      guard try central.littleEndianUInt32(at: cursor) == AuraZip.centralHeader else {
        throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Una voce ZIP non e valida.")
      }
      let flags = try central.littleEndianUInt16(at: cursor + 8)
      let method = try central.littleEndianUInt16(at: cursor + 10)
      let crc32 = try central.littleEndianUInt32(at: cursor + 16)
      let compressedSize = try central.littleEndianUInt32(at: cursor + 20)
      let size = try central.littleEndianUInt32(at: cursor + 24)
      let nameLength = Int(try central.littleEndianUInt16(at: cursor + 28))
      let extraLength = Int(try central.littleEndianUInt16(at: cursor + 30))
      let commentLength = Int(try central.littleEndianUInt16(at: cursor + 32))
      let disk = try central.littleEndianUInt16(at: cursor + 34)
      let localOffset = try central.littleEndianUInt32(at: cursor + 42)
      let nameStart = cursor + 46
      let nextCursor = nameStart + nameLength + extraLength + commentLength
      guard nextCursor <= central.count,
            disk == 0,
            flags & ~AuraZip.utf8Flag == 0,
            method == 0,
            compressedSize == size else {
        throw AuraBackupArchiveError(code: "UNSUPPORTED_ARCHIVE", message: "Il backup usa una funzione ZIP non supportata.")
      }
      let nameData = central.subdata(in: nameStart..<(nameStart + nameLength))
      guard let path = String(data: nameData, encoding: .utf8), auraSafeEntryPath(path) else {
        throw AuraBackupArchiveError(code: "UNSAFE_ARCHIVE_ENTRY", message: "Il backup contiene un percorso non sicuro.")
      }
      entries.append(
        AuraZipEntry(path: path, pathData: nameData, crc32: crc32, size: size, localHeaderOffset: localOffset)
      )
      cursor = nextCursor
    }
    guard cursor == central.count, Set(entries.map(\.path)).count == entries.count else {
      throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "La directory ZIP contiene dati o nomi duplicati.")
    }
    return (entries, centralOffset)
  }

  static func inspect(archiveValue: String) throws -> [AuraBackupArchiveEntryInfo] {
    let archive = try auraFileURL(archiveValue)
    let values = try archive.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true else {
      throw AuraBackupArchiveError(code: "INVALID_BACKUP_FILE", message: "Il file selezionato non e un archivio valido.")
    }
    let (entries, _) = try readCentralDirectory(archive: archive)
    return entries.map { AuraBackupArchiveEntryInfo(path: $0.path, size: UInt64($0.size)) }
  }

  static func extract(archiveValue: String, destinationDirectoryValue: String) throws -> [AuraBackupArchiveEntryInfo] {
    let fileManager = FileManager.default
    let archive = try auraFileURL(archiveValue)
    let destination = try auraFileURL(destinationDirectoryValue)
    let (entries, centralOffset) = try readCentralDirectory(archive: archive)
    if fileManager.fileExists(atPath: destination.path) {
      try fileManager.removeItem(at: destination)
    }
    try fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
    let input = try FileHandle(forReadingFrom: archive)
    do {
      for entry in entries {
        try input.seek(toOffset: UInt64(entry.localHeaderOffset))
        guard let header = try input.read(upToCount: 30), header.count == 30,
              try header.littleEndianUInt32(at: 0) == AuraZip.localHeader else {
          throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Una voce ZIP locale non e valida.")
        }
        let flags = try header.littleEndianUInt16(at: 6)
        let method = try header.littleEndianUInt16(at: 8)
        let headerCRC = try header.littleEndianUInt32(at: 14)
        let compressedSize = try header.littleEndianUInt32(at: 18)
        let size = try header.littleEndianUInt32(at: 22)
        let nameLength = Int(try header.littleEndianUInt16(at: 26))
        let extraLength = Int(try header.littleEndianUInt16(at: 28))
        guard flags & ~AuraZip.utf8Flag == 0,
              method == 0,
              headerCRC == entry.crc32,
              compressedSize == entry.size,
              size == entry.size,
              UInt64(entry.localHeaderOffset) + 30 + UInt64(nameLength + extraLength) + UInt64(size) <= centralOffset else {
          throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Una voce ZIP non corrisponde alla directory centrale.")
        }
        guard let localName = try input.read(upToCount: nameLength), localName == entry.pathData else {
          throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Un nome ZIP locale non corrisponde al manifest interno.")
        }
        if extraLength > 0 {
          guard let extra = try input.read(upToCount: extraLength), extra.count == extraLength else {
            throw AuraBackupArchiveError(code: "CORRUPT_ARCHIVE", message: "Una voce ZIP e troncata.")
          }
        }

        let outputURL = destination.appendingPathComponent(entry.path)
        let standardizedOutput = outputURL.standardizedFileURL
        let destinationPrefix = destination.path.hasSuffix("/") ? destination.path : destination.path + "/"
        guard standardizedOutput.path.hasPrefix(destinationPrefix) else {
          throw AuraBackupArchiveError(code: "UNSAFE_ARCHIVE_ENTRY", message: "Una voce ZIP tenta di uscire dalla directory prevista.")
        }
        try fileManager.createDirectory(
          at: standardizedOutput.deletingLastPathComponent(),
          withIntermediateDirectories: true
        )
        guard fileManager.createFile(atPath: standardizedOutput.path, contents: nil) else {
          throw AuraBackupArchiveError(code: "FILESYSTEM_ERROR", message: "Impossibile creare un file estratto.")
        }
        let output = try FileHandle(forWritingTo: standardizedOutput)
        var crc = AuraCRC32()
        do {
          try auraReadChunks(from: input, byteCount: UInt64(entry.size)) { chunk in
            crc.update(chunk)
            try output.write(contentsOf: chunk)
          }
          try output.close()
        } catch {
          try? output.close()
          throw error
        }
        guard crc.final == entry.crc32 else {
          throw AuraBackupArchiveError(code: "CHECKSUM_MISMATCH", message: "Un file nel backup e corrotto.")
        }
      }
      try input.close()
    } catch {
      try? input.close()
      try? fileManager.removeItem(at: destination)
      throw error
    }
    return entries.map { AuraBackupArchiveEntryInfo(path: $0.path, size: UInt64($0.size)) }
  }
}
