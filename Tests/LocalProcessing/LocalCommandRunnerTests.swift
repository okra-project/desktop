import Foundation
import Testing
@testable import Okra

struct LocalCommandRunnerTests {
    @Test("Canceling an async provider command terminates its process", .timeLimit(.minutes(1)))
    func cancellationTerminatesProcess() async throws {
        let clock = ContinuousClock()
        let startedAt = clock.now
        let task = Task {
            try await LocalCommandRunner.runAsync(
                executableURL: URL(fileURLWithPath: "/bin/sleep"),
                arguments: ["30"]
            )
        }

        try await Task.sleep(for: .milliseconds(100))
        task.cancel()

        do {
            _ = try await task.value
            Issue.record("Canceled provider command unexpectedly succeeded")
        } catch is CancellationError {
            // Expected: the runner reports cancellation after the child exits.
        }

        #expect(startedAt.duration(to: clock.now) < .seconds(3))
    }
}
