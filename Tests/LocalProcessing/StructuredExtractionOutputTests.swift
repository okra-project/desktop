import Foundation
import Testing
@testable import Okra

struct StructuredExtractionOutputTests {
    @Test("Structured Unlimited-OCR JSON decodes normalized layout blocks")
    func structuredOutputDecodesNormalizedBlocks() throws {
        let data = try #require(
            """
            {
              "schemaVersion": 1,
              "object": "local_extraction",
              "provider": {"id": "unlimited-ocr", "name": "Baidu Unlimited-OCR"},
              "title": "sample.pdf",
              "pageCount": 1,
              "completedPageCount": 1,
              "complete": true,
              "simulation": false,
              "pages": [{
                "pageNumber": 1,
                "imageFile": "page-0001.png",
                "markdown": "### Deposit form",
                "plainText": "Deposit form",
                "blocks": [{
                  "id": "page-1-block-1",
                  "type": "title",
                  "sourceType": "title",
                  "text": "Deposit form",
                  "bbox": {"x": 0.01, "y": 0.02, "width": 0.29, "height": 0.03, "unit": "normalized"},
                  "sourceBbox": [10, 20, 300, 50],
                  "sourceBboxScale": 1000
                }],
                "diagnostics": {
                  "rawCharacterCount": 100,
                  "decodedCharacterCount": 90,
                  "tokenArtifactCount": 10,
                  "detectionCount": 1,
                  "malformedDetectionCount": 0,
                  "duplicateBlockCount": 0,
                  "loopDetected": false,
                  "warnings": []
                }
              }]
            }
            """.data(using: .utf8)
        )

        let document = try JSONDecoder().decode(StructuredExtractionDocument.self, from: data)
        let page = try #require(document.pages.first)
        let block = try #require(page.blocks.first)
        let bbox = try #require(block.bbox)

        #expect(document.provider.id == "unlimited-ocr")
        #expect(document.complete)
        #expect(block.type == "title")
        #expect(block.sourceBbox == [10, 20, 300, 50])
        #expect(bbox.width == 0.29)
        #expect(bbox.compactLabel == "x 1% · y 2% · 29% × 3%")
    }
}
