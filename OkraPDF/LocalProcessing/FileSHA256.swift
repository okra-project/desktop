import CryptoKit
import Foundation

enum FileSHA256 {
    static func digest(
        of fileURL: URL,
        expectedBytes: Int64,
        progress: @escaping @Sendable (Int64) -> Void
    ) throws -> String {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        var hasher = SHA256()
        var bytesRead = Int64(0)

        while let data = try handle.read(upToCount: 4 * 1_024 * 1_024), !data.isEmpty {
            try Task.checkCancellation()
            hasher.update(data: data)
            bytesRead += Int64(data.count)
            progress(min(bytesRead, expectedBytes))
        }

        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
