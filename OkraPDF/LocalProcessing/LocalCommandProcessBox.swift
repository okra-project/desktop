import Darwin
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

        if shouldTerminate {
            requestTermination(of: process)
        }
    }

    func cancel() {
        lock.lock()
        isCancelled = true
        let process = process
        lock.unlock()

        if let process {
            requestTermination(of: process)
        }
    }

    var wasCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return isCancelled
    }

    private func requestTermination(of process: Process) {
        guard process.isRunning else { return }
        process.terminate()

        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let shouldForceKill = self.isCancelled
                && self.process === process
                && process.isRunning
            self.lock.unlock()

            if shouldForceKill {
                Darwin.kill(process.processIdentifier, SIGKILL)
            }
        }
    }
}
