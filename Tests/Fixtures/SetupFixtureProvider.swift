import Foundation
@testable import Okra

final class SetupFixtureProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .unlimitedOCR,
        name: "Baidu Unlimited-OCR",
        summary: "Fixture provider",
        setupNote: "Fixture setup"
    )

    private let lock = NSLock()
    private var isReady = false
    private let suspendsDuringDownload: Bool

    init(suspendsDuringDownload: Bool = false) {
        self.suspendsDuringDownload = suspendsDuringDownload
    }

    func availability() -> LocalProviderAvailability {
        lock.withLock {
            isReady ? .ready : .setupRequired("Setup required")
        }
    }

    func install(progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void) async throws {
        progress(
            LocalProviderSetupProgress(
                phase: .preparing,
                fraction: nil,
                message: "Preparing fixture"
            )
        )
        progress(
            LocalProviderSetupProgress(
                phase: .downloadingModel,
                fraction: 0.42,
                message: "Downloading fixture"
            )
        )
        if suspendsDuringDownload {
            try await Task.sleep(for: .seconds(30))
        }
        try Task.checkCancellation()

        lock.withLock {
            isReady = true
        }
        progress(
            LocalProviderSetupProgress(
                phase: .ready,
                fraction: 1,
                message: "Fixture ready"
            )
        )
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        throw LocalProcessingError.providerUnavailable("Fixture does not parse.")
    }
}
