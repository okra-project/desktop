import Foundation
@testable import Okra

final class LifecycleFixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Lifecycle Fixture",
        summary: "Exercises durable page lifecycle transitions",
        setupNote: nil
    )

    private let pauseDuringPage: Duration
    private let failure: (any Error)?

    init(
        pauseDuringPage: Duration = .milliseconds(250),
        failure: (any Error)? = nil
    ) {
        self.pauseDuringPage = pauseDuringPage
        self.failure = failure
    }

    func availability() -> LocalProviderAvailability { .ready }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        let store = LocalPageCheckpointStore(
            outputDirectory: request.outputDirectory,
            totalPages: request.expectedPageCount,
            documentHeader: "# \(request.fileName)"
        )
        try store.prepare()
        try store.markProcessing(pageNumber: 1)
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: request.parserID,
                pageNumber: 1,
                state: .inProgress,
                completedPageCount: 0,
                totalPageCount: request.expectedPageCount,
                message: "Reading page 1"
            )
        )
        try await Task.sleep(for: pauseDuringPage)

        if let failure {
            request.pageProgress(
                LocalPageProgressUpdate(
                    parserID: request.parserID,
                    pageNumber: 1,
                    state: .error,
                    completedPageCount: 0,
                    totalPageCount: request.expectedPageCount,
                    message: failure.localizedDescription
                )
            )
            throw failure
        }

        try store.writePage(pageNumber: 1, markdown: "## Page 1\n\nFixture")
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: request.parserID,
                pageNumber: 1,
                state: .done,
                completedPageCount: 1,
                totalPageCount: request.expectedPageCount,
                message: "Saved page 1"
            )
        )
        progress(1, "Complete")
        return LocalProcessingResult(
            outputURL: try store.assembleResult(),
            pageCount: request.expectedPageCount
        )
    }
}

final class MultiParserLifecycleFixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Multi-parser Lifecycle Fixture",
        summary: "Exercises parser-local lifecycle counts",
        setupNote: nil
    )

    func availability() -> LocalProviderAvailability { .ready }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: .appleVision,
                pageNumber: 1,
                state: .done,
                completedPageCount: 1,
                totalPageCount: 1,
                message: "Apple Vision saved page 1"
            )
        )
        request.pageProgress(
            LocalPageProgressUpdate(
                parserID: .unlimitedOCR,
                pageNumber: 1,
                state: .inProgress,
                completedPageCount: 0,
                totalPageCount: 1,
                message: "Unlimited-OCR is parsing page 1"
            )
        )
        try await Task.sleep(for: .seconds(2))
        throw CancellationError()
    }
}
