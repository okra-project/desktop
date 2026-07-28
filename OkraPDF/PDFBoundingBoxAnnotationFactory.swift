import PDFKit

enum PDFBoundingBoxAnnotationFactory {
    static func make(
        overlay: PDFBoundingBoxOverlay,
        on page: PDFPage,
        selected: Bool
    ) -> PDFAnnotation? {
        guard let bounds = PDFBoundingBoxGeometry.pageBounds(for: overlay.bbox, on: page) else {
            return nil
        }

        let annotation = PDFAnnotation(bounds: bounds, forType: .square, withProperties: nil)
        annotation.userName = "okraPDF · Baidu Unlimited-OCR"
        annotation.contents = tooltip(for: overlay)
        annotation.shouldDisplay = true
        annotation.shouldPrint = false
        applyStyle(to: annotation, label: overlay.label, selected: selected)
        return annotation
    }

    static func applyStyle(
        to annotation: PDFAnnotation,
        label: String,
        selected: Bool
    ) {
        let color = PDFBoundingBoxPalette.color(for: label)
        let border = PDFBorder()
        border.lineWidth = selected ? 3 : 1.5
        border.style = .solid
        annotation.border = border
        annotation.color = color.withAlphaComponent(selected ? 0.95 : 0.68)
        annotation.interiorColor = color.withAlphaComponent(selected ? 0.2 : 0.07)
    }

    private static func tooltip(for overlay: PDFBoundingBoxOverlay) -> String {
        let collapsedText = overlay.text
            .split(whereSeparator: \Character.isWhitespace)
            .joined(separator: " ")
        let clippedText = String(collapsedText.prefix(240))
        return "\(overlay.label) · page \(overlay.pageNumber)\n\(clippedText)"
    }
}
