import Foundation
import PDFKit
import Vision

enum AppleVisionStructuredExtractor {
    struct RecognizedLine: Equatable, Sendable {
        let text: String
        let normalizedBottomLeftBounds: CGRect
    }

    static func nativePage(
        from page: PDFPage,
        pageNumber: Int
    ) -> StructuredExtractionPage {
        let nativeText = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let characterCount = (page.string as NSString?)?.length ?? 0
        let fullSelection = characterCount > 0
            ? page.selection(for: NSRange(location: 0, length: characterCount))
            : nil
        var blocks = (fullSelection?.selectionsByLine() ?? []).compactMap { selection in
            nativeBlock(
                text: selection.string ?? "",
                pageBounds: selection.bounds(for: page),
                page: page,
                pageNumber: pageNumber,
                blockNumber: 0
            )
        }
        blocks = blocks.enumerated().map { index, block in
            StructuredExtractionBlock(
                id: blockID(pageNumber: pageNumber, blockNumber: index + 1),
                type: block.type,
                sourceType: block.sourceType,
                text: block.text,
                bbox: block.bbox,
                sourceBbox: block.sourceBbox,
                sourceBboxScale: block.sourceBboxScale
            )
        }

        if blocks.isEmpty,
           let fullSelection,
           let fallback = nativeBlock(
               text: nativeText,
               pageBounds: fullSelection.bounds(for: page),
               page: page,
               pageNumber: pageNumber,
               blockNumber: 1
           ) {
            blocks = [fallback]
        }

        let text = blocks.isEmpty
            ? nativeText
            : blocks.map(\.text).joined(separator: "\n")
        return pageOutput(
            pageNumber: pageNumber,
            imageFile: "",
            text: text,
            blocks: blocks
        )
    }

    static func scannedPage(
        from observations: [VNRecognizedTextObservation],
        pageNumber: Int
    ) -> StructuredExtractionPage {
        let lines = observations.compactMap { observation -> RecognizedLine? in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            return RecognizedLine(
                text: text,
                normalizedBottomLeftBounds: observation.boundingBox
            )
        }
        return scannedPage(from: lines, pageNumber: pageNumber)
    }

    static func scannedPage(
        from lines: [RecognizedLine],
        pageNumber: Int
    ) -> StructuredExtractionPage {
        let blocks = lines.enumerated().compactMap { index, line -> StructuredExtractionBlock? in
            let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.isEmpty == false,
                  let bbox = StructuredExtractionBoundingBox.visionNormalizedBottomLeft(
                      rect: line.normalizedBottomLeftBounds
                  ),
                  let normalizedBounds = bbox.clippedNormalizedRect else {
                return nil
            }
            return StructuredExtractionBlock(
                id: blockID(pageNumber: pageNumber, blockNumber: index + 1),
                type: "text",
                sourceType: "vision-text-observation",
                text: text,
                bbox: bbox,
                sourceBbox: [
                    normalizedBounds.minX,
                    normalizedBounds.minY,
                    normalizedBounds.maxX,
                    normalizedBounds.maxY,
                ],
                sourceBboxScale: 1
            )
        }
        let text = blocks.map(\.text).joined(separator: "\n")
        return pageOutput(
            pageNumber: pageNumber,
            imageFile: "",
            text: text,
            blocks: blocks
        )
    }

    private static func nativeBlock(
        text: String,
        pageBounds: CGRect,
        page: PDFPage,
        pageNumber: Int,
        blockNumber: Int
    ) -> StructuredExtractionBlock? {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.isEmpty == false,
              let bbox = PDFBoundingBoxGeometry.normalizedTopLeftBoundingBox(
                  for: pageBounds,
                  on: page
              ) else {
            return nil
        }
        return StructuredExtractionBlock(
            id: blockID(pageNumber: pageNumber, blockNumber: blockNumber),
            type: "text",
            sourceType: "pdf-text-line",
            text: text,
            bbox: bbox,
            sourceBbox: [bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height],
            sourceBboxScale: 1
        )
    }

    private static func pageOutput(
        pageNumber: Int,
        imageFile: String,
        text: String,
        blocks: [StructuredExtractionBlock]
    ) -> StructuredExtractionPage {
        StructuredExtractionPage(
            pageNumber: pageNumber,
            imageFile: imageFile,
            markdown: text,
            plainText: text,
            blocks: blocks,
            diagnostics: StructuredExtractionDiagnostics(
                rawCharacterCount: text.count,
                decodedCharacterCount: text.count,
                tokenArtifactCount: 0,
                detectionCount: blocks.count,
                malformedDetectionCount: 0,
                duplicateBlockCount: 0,
                loopDetected: false,
                warnings: []
            )
        )
    }

    private static func blockID(pageNumber: Int, blockNumber: Int) -> String {
        "page-\(pageNumber)-block-\(blockNumber)"
    }
}
