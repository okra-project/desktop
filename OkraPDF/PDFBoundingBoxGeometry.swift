import CoreGraphics
import PDFKit

enum PDFBoundingBoxGeometry {
    static func pageBounds(
        for bbox: StructuredExtractionBoundingBox,
        on page: PDFPage,
        displayBox: PDFDisplayBox = .cropBox
    ) -> CGRect? {
        guard let normalizedRect = bbox.clippedNormalizedRect else { return nil }

        let pageBounds = page.bounds(for: displayBox).standardized
        guard pageBounds.width > 0, pageBounds.height > 0 else { return nil }

        let pageToDisplay = page.transform(for: displayBox)
        let determinant = (pageToDisplay.a * pageToDisplay.d) - (pageToDisplay.b * pageToDisplay.c)
        guard determinant.isFinite, abs(determinant) > .ulpOfOne else { return nil }

        let displayBounds = pageBounds.applying(pageToDisplay).standardized
        guard displayBounds.width > 0, displayBounds.height > 0 else { return nil }

        let displayRect = CGRect(
            x: displayBounds.minX + (normalizedRect.minX * displayBounds.width),
            y: displayBounds.minY + ((1 - normalizedRect.maxY) * displayBounds.height),
            width: normalizedRect.width * displayBounds.width,
            height: normalizedRect.height * displayBounds.height
        )
        let annotationBounds = displayRect
            .applying(pageToDisplay.inverted())
            .standardized
            .intersection(pageBounds)
        guard annotationBounds.isNull == false,
              annotationBounds.width > 0,
              annotationBounds.height > 0 else {
            return nil
        }
        return annotationBounds
    }
}
