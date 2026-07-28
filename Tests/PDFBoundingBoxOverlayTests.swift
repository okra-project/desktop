import AppKit
import Foundation
import PDFKit
import Testing
@testable import Okra

struct PDFBoundingBoxOverlayTests {
    @Test("Normalized boxes clip safely to the page")
    func normalizedBoxesClipToPage() throws {
        let bbox = StructuredExtractionBoundingBox(
            x: -0.1,
            y: 0.8,
            width: 0.4,
            height: 0.4,
            unit: "normalized",
            origin: "top-left"
        )
        let rect = try #require(bbox.clippedNormalizedRect)

        #expect(abs(rect.minX - 0) < 0.000_001)
        #expect(abs(rect.minY - 0.8) < 0.000_001)
        #expect(abs(rect.width - 0.3) < 0.000_001)
        #expect(abs(rect.height - 0.2) < 0.000_001)
    }

    @Test("Invalid or fully out-of-page boxes are rejected")
    func invalidBoxesAreRejected() {
        let invalidBoxes = [
            StructuredExtractionBoundingBox(
                x: 0,
                y: 0,
                width: 0,
                height: 0.2,
                unit: "normalized",
                origin: "top-left"
            ),
            StructuredExtractionBoundingBox(
                x: 2,
                y: 2,
                width: 0.2,
                height: 0.2,
                unit: "normalized",
                origin: "top-left"
            ),
            StructuredExtractionBoundingBox(
                x: .nan,
                y: 0,
                width: 0.2,
                height: 0.2,
                unit: "normalized",
                origin: "top-left"
            ),
            StructuredExtractionBoundingBox(
                x: 0,
                y: 0,
                width: 20,
                height: 20,
                unit: "px",
                origin: "top-left"
            ),
        ]

        for bbox in invalidBoxes {
            #expect(bbox.clippedNormalizedRect == nil)
        }
    }

    @Test("Apple Vision and Baidu structured output become PDF overlays")
    func supportedStructuredOutputBecomesOverlays() throws {
        let baidu = try structuredDocument(providerID: "unlimited-ocr")
        let appleVision = try structuredDocument(providerID: "apple-vision")

        #expect(baidu.pdfBoundingBoxOverlays.map(\.id) == ["title", "clipped"])
        #expect(baidu.pdfBoundingBoxOverlays.map(\.label) == ["Title", "Table"])
        #expect(baidu.pdfBoundingBoxOverlays.allSatisfy { $0.providerName == "Fixture" })
        #expect(appleVision.pdfBoundingBoxOverlays.map(\.id) == ["title", "clipped"])
    }

    @Test("Top-left normalized geometry has fixed crop and rotation mappings")
    func geometryMapsThroughCropAndRotation() throws {
        let bbox = StructuredExtractionBoundingBox(
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
            unit: "normalized",
            origin: "top-left"
        )

        let expectedBounds: [Int: CGRect] = [
            0: CGRect(x: 38, y: 70, width: 54, height: 40),
            90: CGRect(x: 56, y: 40, width: 72, height: 30),
            180: CGRect(x: 128, y: 50, width: 54, height: 40),
            270: CGRect(x: 92, y: 90, width: 72, height: 30),
        ]

        for rotation in [0, 90, 180, 270] {
            let page = try makePage(rotation: rotation)
            let annotationBounds = try #require(PDFBoundingBoxGeometry.pageBounds(for: bbox, on: page))
            let expected = try #require(expectedBounds[rotation])
            expectEqual(annotationBounds, expected)

            let roundTripped = try #require(
                PDFBoundingBoxGeometry.normalizedTopLeftBoundingBox(
                    for: annotationBounds,
                    on: page
                )?.clippedNormalizedRect
            )
            expectEqual(roundTripped, try #require(bbox.clippedNormalizedRect))
        }

        let tallPage = try makePage(
            mediaSize: CGSize(width: 800, height: 1_200),
            cropBounds: CGRect(x: 50, y: 100, width: 400, height: 800),
            rotation: 0
        )
        let tallBounds = try #require(PDFBoundingBoxGeometry.pageBounds(for: bbox, on: tallPage))
        expectEqual(tallBounds, CGRect(x: 90, y: 420, width: 120, height: 320))
    }

    @Test("Overlay annotations remain screen-only and expose source context")
    func annotationIsScreenOnlyAndAccessible() throws {
        let page = try makePage(rotation: 0)
        let overlay = try #require(
            try structuredDocument(providerID: "unlimited-ocr")
                .pdfBoundingBoxOverlays
                .first
        )
        let annotation = try #require(
            PDFBoundingBoxAnnotationFactory.make(overlay: overlay, on: page, selected: true)
        )

        #expect(annotation.shouldDisplay)
        #expect(annotation.shouldPrint == false)
        #expect(annotation.userName == "okraPDF · Fixture")
        #expect(annotation.contents?.contains("Title · page 1") == true)
        #expect(annotation.contents?.contains("Deposit form") == true)
        #expect(annotation.border?.lineWidth == 3)
        #expect(annotation.interiorColor != nil)
    }

    @Test("PDF synchronization adds removable overlays and reports box clicks")
    func pdfSynchronizationIsNonDestructiveAndClickable() throws {
        let page = try makePage(rotation: 0)
        let document = PDFDocument()
        document.insert(page, at: 0)
        let sourceAnnotation = PDFAnnotation(
            bounds: CGRect(x: 30, y: 40, width: 20, height: 20),
            forType: .text,
            withProperties: nil
        )
        page.addAnnotation(sourceAnnotation)
        let sourceAnnotations = page.annotations

        let overlay = try #require(
            try structuredDocument(providerID: "unlimited-ocr")
                .pdfBoundingBoxOverlays
                .first
        )
        var clickedID: String?
        var hoveredIDs: [String?] = []
        let pdfView = PDFBoundingBoxView()
        pdfView.document = document
        let coordinator = PDFDocumentViewCoordinator(
            onOverlaySelection: { clickedID = $0 },
            onOverlayHover: { hoveredIDs.append($0) }
        )
        coordinator.connect(to: pdfView)
        coordinator.synchronize(document: document, overlays: [overlay], selectedOverlayID: nil)

        #expect(page.annotations.count == sourceAnnotations.count + 1)
        let overlayAnnotation = try #require(
            page.annotations.first { $0.userName == "okraPDF · Fixture" }
        )
        let center = CGPoint(x: overlayAnnotation.bounds.midX, y: overlayAnnotation.bounds.midY)
        #expect(coordinator.handleOverlayHover(on: page, at: center) == overlay.id)
        #expect(hoveredIDs == [overlay.id])

        coordinator.synchronize(
            document: document,
            overlays: [overlay],
            selectedOverlayID: nil,
            hoveredOverlayID: overlay.id
        )
        #expect(overlayAnnotation.border?.lineWidth == 2.25)
        #expect(
            coordinator.handleOverlayClick(
                on: page,
                at: center
            )
        )
        #expect(clickedID == overlay.id)
        #expect(coordinator.handleOverlayHover(on: page, at: .zero) == nil)
        #expect(hoveredIDs == [overlay.id, nil])

        coordinator.removeManagedAnnotations()
        #expect(page.annotations.count == sourceAnnotations.count)
        #expect(page.annotations.contains { $0 === sourceAnnotation })
        #expect(page.annotations.contains { $0.userName == "okraPDF · Fixture" } == false)
    }

    private func structuredDocument(providerID: String) throws -> StructuredExtractionDocument {
        let data = try #require(
            """
            {
              "schemaVersion": 1,
              "object": "local_extraction",
              "provider": {"id": "\(providerID)", "name": "Fixture"},
              "title": "sample.pdf",
              "pageCount": 1,
              "completedPageCount": 1,
              "complete": true,
              "simulation": false,
              "pages": [{
                "pageNumber": 1,
                "imageFile": "page-0001.png",
                "markdown": "# Deposit form",
                "plainText": "Deposit form",
                "blocks": [
                  {
                    "id": "title",
                    "type": "title",
                    "sourceType": "title",
                    "text": "Deposit form",
                    "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1, "unit": "normalized", "origin": "top-left"},
                    "sourceBbox": [100, 200, 400, 300],
                    "sourceBboxScale": 1000
                  },
                  {
                    "id": "clipped",
                    "type": "table",
                    "sourceType": "table",
                    "text": "<table><tr><td>Total</td></tr></table>",
                    "bbox": {"x": 0.8, "y": 0.8, "width": 0.4, "height": 0.4, "unit": "normalized", "origin": "top-left"},
                    "sourceBbox": [800, 800, 1200, 1200],
                    "sourceBboxScale": 1000
                  },
                  {
                    "id": "missing",
                    "type": "text",
                    "sourceType": "text",
                    "text": "No source box",
                    "bbox": null,
                    "sourceBbox": null,
                    "sourceBboxScale": null
                  }
                ],
                "diagnostics": {
                  "rawCharacterCount": 100,
                  "decodedCharacterCount": 90,
                  "tokenArtifactCount": 0,
                  "detectionCount": 2,
                  "malformedDetectionCount": 0,
                  "duplicateBlockCount": 0,
                  "loopDetected": false,
                  "warnings": []
                }
              }]
            }
            """.data(using: .utf8)
        )
        return try JSONDecoder().decode(StructuredExtractionDocument.self, from: data)
    }

    private func makePage(
        mediaSize: CGSize = CGSize(width: 240, height: 160),
        cropBounds: CGRect = CGRect(x: 20, y: 30, width: 180, height: 100),
        rotation: Int
    ) throws -> PDFPage {
        let image = NSImage(size: mediaSize)
        image.lockFocus()
        NSColor.white.setFill()
        NSRect(origin: .zero, size: mediaSize).fill()
        image.unlockFocus()

        let page = try #require(PDFPage(image: image))
        page.setBounds(cropBounds, for: .cropBox)
        page.rotation = rotation
        return page
    }

    private func expectEqual(
        _ actual: CGRect,
        _ expected: CGRect,
        tolerance: CGFloat = 0.000_001,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {
        #expect(abs(actual.minX - expected.minX) < tolerance, sourceLocation: sourceLocation)
        #expect(abs(actual.minY - expected.minY) < tolerance, sourceLocation: sourceLocation)
        #expect(abs(actual.width - expected.width) < tolerance, sourceLocation: sourceLocation)
        #expect(abs(actual.height - expected.height) < tolerance, sourceLocation: sourceLocation)
    }
}
