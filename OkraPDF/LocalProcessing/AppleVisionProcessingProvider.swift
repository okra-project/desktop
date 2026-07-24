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
            var sections: [String] = ["# \(request.fileName)"]

            for index in 0..<document.pageCount {
                try Task.checkCancellation()
                guard let page = document.page(at: index) else {
                    throw LocalProcessingError.invalidPDF
                }

                let nativeText = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let text: String
                if nativeText.count >= 20 {
                    progress(
                        Double(index) / Double(document.pageCount),
                        "Reading page \(index + 1) of \(document.pageCount)"
                    )
                    text = nativeText
                } else {
                    progress(
                        Double(index) / Double(document.pageCount),
                        "Recognizing scanned page \(index + 1) of \(document.pageCount)"
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
                sections.append("## Page \(index + 1)\n\n\(text)")
            }

            try FileManager.default.createDirectory(
                at: request.outputDirectory,
                withIntermediateDirectories: true
            )
            let outputURL = request.outputDirectory.appendingPathComponent("result.md")
            try sections.joined(separator: "\n\n").write(
                to: outputURL,
                atomically: true,
                encoding: .utf8
            )
            progress(1, "Extraction complete")
            return LocalProcessingResult(outputURL: outputURL, pageCount: document.pageCount)
        }.value
    }
}
