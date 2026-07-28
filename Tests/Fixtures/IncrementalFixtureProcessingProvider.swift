import Foundation
@testable import Okra

final class IncrementalFixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Incremental Fixture",
        summary: "Writes deterministic page checkpoints",
        setupNote: nil
    )

    private let pageCount: Int
    private let pauseAfterFirstPage: Duration

    init(pageCount: Int, pauseAfterFirstPage: Duration = .milliseconds(250)) {
        self.pageCount = pageCount
        self.pauseAfterFirstPage = pauseAfterFirstPage
    }

    func availability() -> LocalProviderAvailability { .ready }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        let store = LocalPageCheckpointStore(
            outputDirectory: request.outputDirectory,
            totalPages: pageCount,
            documentHeader: "# \(request.fileName)"
        )
        try store.prepare()

        for pageNumber in 1...pageCount {
            try store.markProcessing(pageNumber: pageNumber)
            request.pageProgress(
                LocalPageProgressUpdate(
                    parserID: request.parserID,
                    pageNumber: pageNumber,
                    state: .inProgress,
                    completedPageCount: pageNumber - 1,
                    totalPageCount: pageCount,
                    message: "Parsing page \(pageNumber) of \(pageCount)"
                )
            )
            try store.writePage(
                pageNumber: pageNumber,
                markdown: "## Page \(pageNumber)\n\nFixture \(pageNumber)"
            )
            request.pageProgress(
                LocalPageProgressUpdate(
                    parserID: request.parserID,
                    pageNumber: pageNumber,
                    state: .done,
                    completedPageCount: pageNumber,
                    totalPageCount: pageCount,
                    message: "Saved page \(pageNumber) of \(pageCount)"
                )
            )
            progress(
                Double(pageNumber) / Double(pageCount),
                "Saved page \(pageNumber) of \(pageCount)"
            )

            if pageNumber == 1 {
                try await Task.sleep(for: pauseAfterFirstPage)
            }
        }

        return LocalProcessingResult(
            outputURL: try store.assembleResult(),
            pageCount: pageCount
        )
    }
}
