import Foundation
import Vision

final class AppleVisionProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Apple Vision",
        summary: "Reads native PDF text first, then uses built-in OCR for scanned pages.",
        setupNote: nil
    )

    func availability() -> LocalProviderAvailability { .ready }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        let worker = Task.detached(priority: .userInitiated) {
            let document = try PDFPageRenderer.openDocument(at: request.sourceURL)
            let pageStore = LocalPageCheckpointStore(
                outputDirectory: request.outputDirectory,
                totalPages: document.pageCount,
                documentHeader: "# \(request.fileName)"
            )
            try pageStore.prepare()
            let structuredOutputURL = request.outputDirectory.appendingPathComponent("result.json")
            var structuredPages: [StructuredExtractionPage] = []

            for index in 0..<document.pageCount {
                try Task.checkCancellation()
                let pageNumber = index + 1
                let structuredPageURL = pageStore.pageURL(pageNumber: pageNumber)
                    .deletingPathExtension()
                    .appendingPathExtension("json")
                if try pageStore.status(pageNumber: pageNumber) == .succeeded,
                   let restoredPage = try? StructuredExtractionPage.load(from: structuredPageURL) {
                    structuredPages.append(restoredPage)
                    try Self.structuredDocument(
                        title: request.fileName,
                        pageCount: document.pageCount,
                        pages: structuredPages
                    ).write(to: structuredOutputURL)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: document.pageCount,
                            message: "Restored page \(pageNumber) of \(document.pageCount) from disk"
                        )
                    )
                    progress(
                        Double(manifest.completedPageCount) / Double(document.pageCount),
                        "Restored page \(pageNumber) of \(document.pageCount) from disk"
                    )
                    continue
                }
                let progressManifest = try pageStore.reconcileCompletedPages()
                try pageStore.markProcessing(pageNumber: pageNumber)
                request.pageProgress(
                    LocalPageProgressUpdate(
                        parserID: request.parserID,
                        pageNumber: pageNumber,
                        state: .inProgress,
                        completedPageCount: progressManifest.completedPageCount,
                        totalPageCount: document.pageCount,
                        message: "Parsing page \(pageNumber) of \(document.pageCount)"
                    )
                )

                do {
                    guard let page = document.page(at: index) else {
                        throw LocalProcessingError.invalidPDF
                    }

                    let nativeText = page.string?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let structuredPage: StructuredExtractionPage
                    if nativeText.isEmpty == false {
                        progress(
                            Double(index) / Double(document.pageCount),
                            "Reading page \(pageNumber) of \(document.pageCount)"
                        )
                        structuredPage = AppleVisionStructuredExtractor.nativePage(
                            from: page,
                            pageNumber: pageNumber
                        )
                    } else {
                        progress(
                            Double(index) / Double(document.pageCount),
                            "Recognizing scanned page \(pageNumber) of \(document.pageCount)"
                        )
                        let image = try PDFPageRenderer.pageImage(
                            from: document,
                            at: index,
                            maxDimension: 2_400
                        )
                        let recognition = VNRecognizeTextRequest()
                        recognition.recognitionLevel = .accurate
                        recognition.usesLanguageCorrection = true
                        let handler = VNImageRequestHandler(cgImage: image, options: [:])
                        try handler.perform([recognition])
                        structuredPage = AppleVisionStructuredExtractor.scannedPage(
                            from: recognition.results ?? [],
                            pageNumber: pageNumber
                        )
                    }
                    try structuredPage.write(to: structuredPageURL)
                    try pageStore.writePage(
                        pageNumber: pageNumber,
                        markdown: "## Page \(pageNumber)\n\n\(structuredPage.markdown)"
                    )
                    structuredPages.append(structuredPage)
                    try Self.structuredDocument(
                        title: request.fileName,
                        pageCount: document.pageCount,
                        pages: structuredPages
                    ).write(to: structuredOutputURL)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: document.pageCount,
                            message: "Saved page \(pageNumber) of \(document.pageCount)"
                        )
                    )
                    progress(
                        Double(pageNumber) / Double(document.pageCount),
                        "Saved page \(pageNumber) of \(document.pageCount)"
                    )
                } catch is CancellationError {
                    let completed = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .attention,
                            completedPageCount: completed,
                            totalPageCount: document.pageCount,
                            message: "Canceled. Resume to continue page \(pageNumber)."
                        )
                    )
                    throw CancellationError()
                } catch {
                    try? pageStore.markFailed(pageNumber: pageNumber, error: error)
                    let completed = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .error,
                            completedPageCount: completed,
                            totalPageCount: document.pageCount,
                            message: error.localizedDescription
                        )
                    )
                    throw error
                }
            }

            let outputURL = try pageStore.assembleResult()
            try Self.structuredDocument(
                title: request.fileName,
                pageCount: document.pageCount,
                pages: structuredPages
            ).write(to: structuredOutputURL)
            progress(1, "Extraction complete")
            return LocalProcessingResult(
                outputURL: outputURL,
                pageCount: document.pageCount,
                structuredOutputURL: structuredOutputURL
            )
        }

        return try await withTaskCancellationHandler {
            try await worker.value
        } onCancel: {
            worker.cancel()
        }
    }

    private static func structuredDocument(
        title: String,
        pageCount: Int,
        pages: [StructuredExtractionPage]
    ) -> StructuredExtractionDocument {
        let orderedPages = pages.sorted { $0.pageNumber < $1.pageNumber }
        return StructuredExtractionDocument(
            schemaVersion: 1,
            object: "local_extraction",
            provider: StructuredExtractionProvider(
                id: LocalProviderID.appleVision.rawValue,
                name: "Apple Vision"
            ),
            title: title,
            pageCount: pageCount,
            completedPageCount: orderedPages.count,
            complete: orderedPages.count == pageCount,
            simulation: false,
            pages: orderedPages
        )
    }
}
