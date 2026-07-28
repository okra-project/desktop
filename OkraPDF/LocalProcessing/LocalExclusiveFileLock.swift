import Darwin
import Foundation

/// Cross-process advisory lock used to queue heavyweight local provider runs
/// instead of letting two model loads compete for unified memory.
final class LocalExclusiveFileLock: @unchecked Sendable {
    private let url: URL
    private var descriptor: Int32 = -1

    init(url: URL) {
        self.url = url
    }

    /// Acquires the lock, waiting while another process holds it.
    /// `onWait` fires once when the lock is not immediately available so the
    /// caller can explain the pause. Throws `CancellationError` if the task is
    /// cancelled while waiting.
    func acquire(
        pollInterval: Duration = .milliseconds(500),
        onWait: @Sendable () -> Void = {}
    ) async throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let fd = open(url.path, O_RDWR | O_CREAT, 0o644)
        guard fd >= 0 else {
            throw LocalProcessingError.providerUnavailable(
                "Could not open the provider run lock: \(String(cString: strerror(errno)))."
            )
        }

        var announcedWait = false
        while true {
            if flock(fd, LOCK_EX | LOCK_NB) == 0 {
                descriptor = fd
                return
            }
            let lockError = errno
            guard lockError == EWOULDBLOCK else {
                close(fd)
                throw LocalProcessingError.providerUnavailable(
                    "Could not take the provider run lock: \(String(cString: strerror(lockError)))."
                )
            }
            if announcedWait == false {
                announcedWait = true
                onWait()
            }
            do {
                try Task.checkCancellation()
                try await Task.sleep(for: pollInterval)
            } catch {
                close(fd)
                throw error
            }
        }
    }

    func release() {
        guard descriptor >= 0 else { return }
        flock(descriptor, LOCK_UN)
        close(descriptor)
        descriptor = -1
    }

    deinit {
        release()
    }
}
