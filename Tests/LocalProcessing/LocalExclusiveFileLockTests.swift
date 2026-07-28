import Foundation
import Testing
@testable import Okra

private final class LockProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var _waitAnnounced = false
    private var _acquired = false

    var waitAnnounced: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _waitAnnounced
    }

    var acquired: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _acquired
    }

    func markWaitAnnounced() {
        lock.lock()
        _waitAnnounced = true
        lock.unlock()
    }

    func markAcquired() {
        lock.lock()
        _acquired = true
        lock.unlock()
    }
}

struct LocalExclusiveFileLockTests {
    @Test("Second acquirer waits until the first holder releases", .timeLimit(.minutes(1)))
    func secondAcquirerWaitsForRelease() async throws {
        let directory = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-lock-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let lockURL = directory.appendingPathComponent("worker.lock")

        let first = LocalExclusiveFileLock(url: lockURL)
        try await first.acquire()

        let probe = LockProbe()
        let second = LocalExclusiveFileLock(url: lockURL)
        let waitingTask = Task {
            try await second.acquire(pollInterval: .milliseconds(20)) {
                probe.markWaitAnnounced()
            }
            probe.markAcquired()
        }

        try await Task.sleep(for: .milliseconds(200))
        #expect(probe.waitAnnounced)
        #expect(probe.acquired == false)

        first.release()
        try await waitingTask.value
        #expect(probe.acquired)
        second.release()
    }

    @Test("Cancelling a waiting acquirer throws instead of hanging", .timeLimit(.minutes(1)))
    func cancelledWaitThrows() async throws {
        let directory = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-lock-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let lockURL = directory.appendingPathComponent("worker.lock")

        let first = LocalExclusiveFileLock(url: lockURL)
        try await first.acquire()

        let second = LocalExclusiveFileLock(url: lockURL)
        let waitingTask = Task {
            try await second.acquire(pollInterval: .milliseconds(20))
        }
        try await Task.sleep(for: .milliseconds(100))
        waitingTask.cancel()

        await #expect(throws: CancellationError.self) {
            try await waitingTask.value
        }

        // The cancelled waiter must not leave the lock held.
        first.release()
        let third = LocalExclusiveFileLock(url: lockURL)
        try await third.acquire()
        third.release()
    }
}
