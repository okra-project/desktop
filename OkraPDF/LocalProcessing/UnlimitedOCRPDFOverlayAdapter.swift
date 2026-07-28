import Foundation

extension StructuredExtractionDocument {
    var unlimitedOCRPDFOverlays: [PDFBoundingBoxOverlay] {
        guard provider.id == LocalProviderID.unlimitedOCR.rawValue else { return [] }

        return pages.flatMap { page -> [PDFBoundingBoxOverlay] in
            guard page.pageNumber > 0, page.pageNumber <= pageCount else { return [] }

            return page.blocks.compactMap { block in
                guard let bbox = block.bbox, bbox.clippedNormalizedRect != nil else { return nil }

                return PDFBoundingBoxOverlay(
                    id: block.id,
                    pageNumber: page.pageNumber,
                    label: block.overlayLabel,
                    text: block.displayText,
                    bbox: bbox
                )
            }
        }
    }
}

private extension StructuredExtractionBlock {
    var overlayLabel: String {
        switch type.lowercased() {
        case "title":
            return "Title"
        case "heading", "header", "section-header":
            return "Section-header"
        case "page-header":
            return "Page-header"
        case "page-footer", "footer", "footnote":
            return "Page-footer"
        case "list", "list-item":
            return "List-item"
        case "picture", "image", "figure":
            return "Picture"
        case "caption":
            return "Caption"
        case "equation", "formula":
            return "Formula"
        case "table":
            return "Table"
        default:
            return "Text"
        }
    }
}
