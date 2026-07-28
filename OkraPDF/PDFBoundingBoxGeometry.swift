import CoreGraphics
import PDFKit

enum PDFBoundingBoxGeometry {
    static func pageBounds(
        for bbox: StructuredExtractionBoundingBox,
        on page: PDFPage,
        displayBox: PDFDisplayBox = .cropBox
    ) -> CGRect? {
        guard let normalizedRect = bbox.clippedNormalizedRect else { return nil }
        guard let projection = projection(for: page, displayBox: displayBox) else { return nil }

        let displayRect = CGRect(
            x: projection.displayBounds.minX
                + (normalizedRect.minX * projection.displayBounds.width),
            y: projection.displayBounds.minY
                + ((1 - normalizedRect.maxY) * projection.displayBounds.height),
            width: normalizedRect.width * projection.displayBounds.width,
            height: normalizedRect.height * projection.displayBounds.height
        )
        let annotationBounds = displayRect
            .applying(projection.pageToDisplay.inverted())
            .standardized
            .intersection(projection.pageBounds)
        guard annotationBounds.isNull == false,
              annotationBounds.width > 0,
              annotationBounds.height > 0 else {
            return nil
        }
        return annotationBounds
    }

    static func normalizedTopLeftBoundingBox(
        for pageRect: CGRect,
        on page: PDFPage,
        displayBox: PDFDisplayBox = .cropBox
    ) -> StructuredExtractionBoundingBox? {
        guard let projection = projection(for: page, displayBox: displayBox) else { return nil }

        let clippedPageRect = pageRect.standardized.intersection(projection.pageBounds)
        guard clippedPageRect.isNull == false,
              clippedPageRect.width > 0,
              clippedPageRect.height > 0 else {
            return nil
        }

        let displayRect = clippedPageRect
            .applying(projection.pageToDisplay)
            .standardized
            .intersection(projection.displayBounds)
        guard displayRect.isNull == false,
              displayRect.width > 0,
              displayRect.height > 0 else {
            return nil
        }

        return StructuredExtractionBoundingBox.normalizedTopLeft(
            rect: CGRect(
                x: (displayRect.minX - projection.displayBounds.minX)
                    / projection.displayBounds.width,
                y: 1 - ((displayRect.maxY - projection.displayBounds.minY)
                    / projection.displayBounds.height),
                width: displayRect.width / projection.displayBounds.width,
                height: displayRect.height / projection.displayBounds.height
            )
        )
    }

    private static func projection(
        for page: PDFPage,
        displayBox: PDFDisplayBox
    ) -> (pageBounds: CGRect, displayBounds: CGRect, pageToDisplay: CGAffineTransform)? {
        let pageBounds = page.bounds(for: displayBox).standardized
        guard pageBounds.width > 0, pageBounds.height > 0 else { return nil }

        let pageToDisplay = page.transform(for: displayBox)
        let determinant = (pageToDisplay.a * pageToDisplay.d)
            - (pageToDisplay.b * pageToDisplay.c)
        guard determinant.isFinite, abs(determinant) > .ulpOfOne else { return nil }

        let displayBounds = pageBounds.applying(pageToDisplay).standardized
        guard displayBounds.width > 0, displayBounds.height > 0 else { return nil }
        return (pageBounds, displayBounds, pageToDisplay)
    }
}
