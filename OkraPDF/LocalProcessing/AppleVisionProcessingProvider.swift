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
        try await Task.detached(priority: .userInitiated) {
            let document = try PDFPageRenderer.openDocument(at: request.sourceURL)
            let pageStore = LocalPageCheckpointStore(
                outputDirectory: request.outputDirectory,
                totalPages: document.pageCount,
                documentHeader: "# \(request.fileName)"
            )
            try pageStore.prepare()

            for index in 0..<document.pageCount {
                try Task.checkCancellation()
                let pageNumber = index + 1
                try pageStore.markProcessing(pageNumber: pageNumber)

                do {
                    guard let page = document.page(at: index) else {
                        throw LocalProcessingError.invalidPDF
                    }

                    let nativeText = page.string?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let text: String
                    if nativeText.count >= 20 {
                        progress(
                            Double(index) / Double(document.pageCount),
                            "Reading page \(pageNumber) of \(document.pageCount)"
                        )
                        text = nativeText
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
                        text = (recognition.results ?? [])
                            .compactMap { $0.topCandidates(1).first?.string }
                            .joined(separator: "\n")
                    }
                    try pageStore.writePage(
                        pageNumber: pageNumber,
                        markdown: "## Page \(pageNumber)\n\n\(text)"
                    )
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            pageNumber: pageNumber,
                            completedPageCount: pageNumber,
                            totalPageCount: document.pageCount
                        )
                    )
                    progress(
                        Double(pageNumber) / Double(document.pageCount),
                        "Saved page \(pageNumber) of \(document.pageCount)"
                    )
                } catch {
                    try? pageStore.markFailed(pageNumber: pageNumber, error: error)
                    throw error
                }
            }

            let outputURL = try pageStore.assembleResult()
            progress(1, "Extraction complete")
            return LocalProcessingResult(outputURL: outputURL, pageCount: document.pageCount)
        }.value
    }
}
