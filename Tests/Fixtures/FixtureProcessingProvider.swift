import Foundation
@testable import Okra

final class FixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Fixture Parser",
        summary: "Test parser",
        setupNote: nil
    )

    func availability() -> LocalProviderAvailability {
        .ready
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        try FileManager.default.createDirectory(
            at: request.outputDirectory,
            withIntermediateDirectories: true
        )
        let outputURL = request.outputDirectory.appendingPathComponent("result.md")
        try "# Parsed\n".write(to: outputURL, atomically: true, encoding: .utf8)
        progress(1, "Complete")
        return LocalProcessingResult(outputURL: outputURL, pageCount: 1)
    }
}
