import Foundation

final class ModelDownloadDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let destinationURL: URL
    private let resumeDataURL: URL
    private let expectedBytes: Int64
    private let progress: @Sendable (Int64) -> Void
    private let continuation: CheckedContinuation<Void, Error>
    private var moveError: Error?
    private var session: URLSession?

    init(
        destinationURL: URL,
        resumeDataURL: URL,
        expectedBytes: Int64,
        progress: @escaping @Sendable (Int64) -> Void,
        continuation: CheckedContinuation<Void, Error>
    ) {
        self.destinationURL = destinationURL
        self.resumeDataURL = resumeDataURL
        self.expectedBytes = expectedBytes
        self.progress = progress
        self.continuation = continuation
    }

    func retain(session: URLSession) {
        self.session = session
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        progress(min(totalBytesWritten, expectedBytes))
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let response = downloadTask.response as? HTTPURLResponse,
              (200...299).contains(response.statusCode) else {
            moveError = URLError(.badServerResponse)
            return
        }

        do {
            try FileManager.default.createDirectory(
                at: destinationURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.moveItem(at: location, to: destinationURL)
        } catch {
            moveError = error
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        defer {
            session.finishTasksAndInvalidate()
            self.session = nil
        }

        if let error {
            let nsError = error as NSError
            if let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
                try? FileManager.default.createDirectory(
                    at: resumeDataURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try? resumeData.write(to: resumeDataURL, options: .atomic)
            }

            if nsError.code == URLError.cancelled.rawValue {
                continuation.resume(throwing: CancellationError())
            } else {
                try? FileManager.default.removeItem(at: resumeDataURL)
                continuation.resume(throwing: error)
            }
            return
        }

        if let moveError {
            continuation.resume(throwing: moveError)
            return
        }

        try? FileManager.default.removeItem(at: resumeDataURL)
        progress(expectedBytes)
        continuation.resume()
    }
}
