import Foundation

final class LocalCommandProcessBox: @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    private var isCancelled = false

    func register(_ process: Process) {
        lock.lock()
        self.process = process
        let shouldTerminate = isCancelled
        lock.unlock()

        if shouldTerminate, process.isRunning {
            process.terminate()
        }
    }

    func cancel() {
        lock.lock()
        isCancelled = true
        let process = process
        lock.unlock()

        if let process, process.isRunning {
            process.terminate()
        }
    }

    var wasCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return isCancelled
    }
}
