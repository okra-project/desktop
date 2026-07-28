import Foundation
@testable import Okra

final class ResumableFixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Resumable Fixture",
        summary: "Exercises durable progress, cancellation, and checkpoint resume",
        setupNote: nil
    )

    private let pageCount: Int
    private let pauseAfterPage: Duration

    init(pageCount: Int, pauseAfterPage: Duration = .milliseconds(300)) {
        self.pageCount = pageCount
        self.pauseAfterPage = pauseAfterPage
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
            try Task.checkCancellation()
            if try store.status(pageNumber: pageNumber) == .succeeded {
                let manifest = try store.reconcileCompletedPages()
                request.pageProgress(
                    LocalPageProgressUpdate(
                        pageNumber: pageNumber,
                        completedPageCount: manifest.completedPageCount,
                        totalPageCount: pageCount
                    )
                )
                continue
            }

            progress(
                Double(pageNumber - 1) / Double(pageCount),
                "Processing page \(pageNumber) of \(pageCount)"
            )
            try store.markProcessing(pageNumber: pageNumber)
            try store.writePage(
                pageNumber: pageNumber,
                markdown: "## Page \(pageNumber)\n\nFixture \(pageNumber)"
            )
            let manifest = try store.reconcileCompletedPages()
            request.pageProgress(
                LocalPageProgressUpdate(
                    pageNumber: pageNumber,
                    completedPageCount: manifest.completedPageCount,
                    totalPageCount: pageCount
                )
            )
            progress(
                Double(manifest.completedPageCount) / Double(pageCount),
                "Saved page \(pageNumber) of \(pageCount)"
            )
            try await Task.sleep(for: pauseAfterPage)
        }

        return LocalProcessingResult(
            outputURL: try store.assembleResult(),
            pageCount: pageCount
        )
    }
}
