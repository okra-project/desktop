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

    @Test("Only Baidu structured output becomes PDF overlays")
    func onlyBaiduOutputBecomesOverlays() throws {
        let baidu = try structuredDocument(providerID: "unlimited-ocr")
        let appleVision = try structuredDocument(providerID: "apple-vision")

        #expect(baidu.unlimitedOCRPDFOverlays.map(\.id) == ["title", "clipped"])
        #expect(baidu.unlimitedOCRPDFOverlays.map(\.label) == ["Title", "Table"])
        #expect(appleVision.unlimitedOCRPDFOverlays.isEmpty)
    }

    @Test("Top-left normalized geometry maps through crop offsets and page rotation")
    func geometryMapsThroughCropAndRotation() throws {
        let bbox = StructuredExtractionBoundingBox(
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
            unit: "normalized",
            origin: "top-left"
        )

        for rotation in [0, 90, 180, 270] {
            let page = try makePage(rotation: rotation)
            let annotationBounds = try #require(PDFBoundingBoxGeometry.pageBounds(for: bbox, on: page))
            let pageBounds = page.bounds(for: .cropBox).standardized
            let transform = page.transform(for: .cropBox)
            let displayBounds = pageBounds.applying(transform).standardized
            let renderedBounds = annotationBounds.applying(transform).standardized

            #expect(abs(renderedBounds.minX - (displayBounds.minX + displayBounds.width * 0.1)) < 0.000_001)
            #expect(abs(renderedBounds.minY - (displayBounds.minY + displayBounds.height * 0.4)) < 0.000_001)
            #expect(abs(renderedBounds.width - (displayBounds.width * 0.3)) < 0.000_001)
            #expect(abs(renderedBounds.height - (displayBounds.height * 0.4)) < 0.000_001)
            #expect(pageBounds.contains(annotationBounds))
        }
    }

    @Test("Overlay annotations remain screen-only and expose source context")
    func annotationIsScreenOnlyAndAccessible() throws {
        let page = try makePage(rotation: 0)
        let overlay = try #require(
            try structuredDocument(providerID: "unlimited-ocr")
                .unlimitedOCRPDFOverlays
                .first
        )
        let annotation = try #require(
            PDFBoundingBoxAnnotationFactory.make(overlay: overlay, on: page, selected: true)
        )

        #expect(annotation.shouldDisplay)
        #expect(annotation.shouldPrint == false)
        #expect(annotation.userName == "okraPDF · Baidu Unlimited-OCR")
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
                .unlimitedOCRPDFOverlays
                .first
        )
        var clickedID: String?
        let pdfView = PDFBoundingBoxView()
        pdfView.document = document
        let coordinator = PDFDocumentViewCoordinator { clickedID = $0 }
        coordinator.connect(to: pdfView)
        coordinator.synchronize(document: document, overlays: [overlay], selectedOverlayID: nil)

        #expect(page.annotations.count == sourceAnnotations.count + 1)
        let overlayAnnotation = try #require(
            page.annotations.first { $0.userName == "okraPDF · Baidu Unlimited-OCR" }
        )
        #expect(
            coordinator.handleOverlayClick(
                on: page,
                at: CGPoint(x: overlayAnnotation.bounds.midX, y: overlayAnnotation.bounds.midY)
            )
        )
        #expect(clickedID == overlay.id)

        coordinator.removeManagedAnnotations()
        #expect(page.annotations.count == sourceAnnotations.count)
        #expect(page.annotations.contains { $0 === sourceAnnotation })
        #expect(page.annotations.contains { $0.userName == "okraPDF · Baidu Unlimited-OCR" } == false)
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

    private func makePage(rotation: Int) throws -> PDFPage {
        let image = NSImage(size: NSSize(width: 240, height: 160))
        image.lockFocus()
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: 240, height: 160).fill()
        image.unlockFocus()

        let page = try #require(PDFPage(image: image))
        page.setBounds(CGRect(x: 20, y: 30, width: 180, height: 100), for: .cropBox)
        page.rotation = rotation
        return page
    }
}
