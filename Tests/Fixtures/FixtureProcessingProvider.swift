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
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: request.parserID,
                pageNumber: 1,
                state: .inProgress,
                completedPageCount: 0,
                totalPageCount: 1,
                message: "Parsing page 1 of 1"
            )
        )
        try FileManager.default.createDirectory(
            at: request.outputDirectory,
            withIntermediateDirectories: true
        )
        let outputURL = request.outputDirectory.appendingPathComponent("result.md")
        try "# Parsed\n".write(to: outputURL, atomically: true, encoding: .utf8)
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: request.parserID,
                pageNumber: 1,
                state: .done,
                completedPageCount: 1,
                totalPageCount: 1,
                message: "Saved page 1 of 1"
            )
        )
        progress(1, "Complete")
        return LocalProcessingResult(outputURL: outputURL, pageCount: 1)
    }
}
