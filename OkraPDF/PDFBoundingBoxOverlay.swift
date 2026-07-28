import Foundation

struct PDFBoundingBoxOverlay: Equatable, Identifiable, Sendable {
    let id: String
    let pageNumber: Int
    let label: String
    let text: String
    let bbox: StructuredExtractionBoundingBox

    var area: Double {
        bbox.width * bbox.height
    }

    var accessibilityLabel: String {
        "\(label) on page \(pageNumber): \(text)"
    }
}
