import Foundation

enum AsyncTestTimeoutError: Error {
    case conditionNotMet(String)
}

@MainActor
func waitUntil(
    _ description: String,
    timeout: Duration = .seconds(5),
    condition: () -> Bool
) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)

    while condition() == false {
        guard clock.now < deadline else {
            throw AsyncTestTimeoutError.conditionNotMet(description)
        }
        try await Task.sleep(for: .milliseconds(10))
    }
}
