import Foundation

final class ModelDownloadTaskBox: @unchecked Sendable {
    private let lock = NSLock()
    private var task: URLSessionDownloadTask?
    private var isCancelled = false
    private let resumeDataURL: URL

    init(resumeDataURL: URL) {
        self.resumeDataURL = resumeDataURL
    }

    func register(_ task: URLSessionDownloadTask) {
        lock.lock()
        self.task = task
        let shouldCancel = isCancelled
        lock.unlock()

        if shouldCancel {
            cancel(task)
        }
    }

    func cancel() {
        lock.lock()
        isCancelled = true
        let task = task
        lock.unlock()

        if let task {
            cancel(task)
        }
    }

    private func cancel(_ task: URLSessionDownloadTask) {
        task.cancel(byProducingResumeData: { [resumeDataURL] resumeData in
            guard let resumeData else { return }
            try? FileManager.default.createDirectory(
                at: resumeDataURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? resumeData.write(to: resumeDataURL, options: .atomic)
        })
    }
}
