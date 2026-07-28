import PDFKit

enum PDFBoundingBoxAnnotationFactory {
    static func make(
        overlay: PDFBoundingBoxOverlay,
        on page: PDFPage,
        selected: Bool,
        hovered: Bool = false
    ) -> PDFAnnotation? {
        guard let bounds = PDFBoundingBoxGeometry.pageBounds(for: overlay.bbox, on: page) else {
            return nil
        }

        let annotation = PDFAnnotation(bounds: bounds, forType: .square, withProperties: nil)
        annotation.userName = "okraPDF · \(overlay.providerName)"
        annotation.contents = tooltip(for: overlay)
        annotation.shouldDisplay = true
        annotation.shouldPrint = false
        applyStyle(
            to: annotation,
            label: overlay.label,
            selected: selected,
            hovered: hovered
        )
        return annotation
    }

    static func applyStyle(
        to annotation: PDFAnnotation,
        label: String,
        selected: Bool,
        hovered: Bool = false
    ) {
        let color = PDFBoundingBoxPalette.color(for: label)
        let border = PDFBorder()
        border.lineWidth = selected ? 3 : (hovered ? 2.25 : 1.5)
        border.style = .solid
        annotation.border = border
        annotation.color = color.withAlphaComponent(selected ? 0.95 : (hovered ? 0.86 : 0.68))
        annotation.interiorColor = color.withAlphaComponent(selected ? 0.2 : (hovered ? 0.14 : 0.07))
    }

    private static func tooltip(for overlay: PDFBoundingBoxOverlay) -> String {
        let collapsedText = overlay.text
            .split(whereSeparator: \Character.isWhitespace)
            .joined(separator: " ")
        let clippedText = String(collapsedText.prefix(240))
        return "\(overlay.label) · page \(overlay.pageNumber)\n\(clippedText)"
    }
}
