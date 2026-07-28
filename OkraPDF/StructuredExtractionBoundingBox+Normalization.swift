import CoreGraphics

extension StructuredExtractionBoundingBox {
    static func normalizedTopLeft(rect: CGRect) -> StructuredExtractionBoundingBox? {
        guard rect.origin.x.isFinite,
              rect.origin.y.isFinite,
              rect.width.isFinite,
              rect.height.isFinite else {
            return nil
        }

        let bbox = StructuredExtractionBoundingBox(
            x: rect.minX,
            y: rect.minY,
            width: rect.width,
            height: rect.height,
            unit: "normalized",
            origin: "top-left"
        )
        guard let clippedRect = bbox.clippedNormalizedRect else { return nil }
        return StructuredExtractionBoundingBox(
            x: clippedRect.minX,
            y: clippedRect.minY,
            width: clippedRect.width,
            height: clippedRect.height,
            unit: "normalized",
            origin: "top-left"
        )
    }

    static func visionNormalizedBottomLeft(rect: CGRect) -> StructuredExtractionBoundingBox? {
        normalizedTopLeft(
            rect: CGRect(
                x: rect.minX,
                y: 1 - rect.maxY,
                width: rect.width,
                height: rect.height
            )
        )
    }

    var clippedNormalizedRect: CGRect? {
        guard unit == "normalized",
              origin == "top-left",
              x.isFinite,
              y.isFinite,
              width.isFinite,
              height.isFinite,
              width > 0,
              height > 0 else {
            return nil
        }

        let minimumX = max(0, x)
        let minimumY = max(0, y)
        let maximumX = min(1, x + width)
        let maximumY = min(1, y + height)
        guard maximumX > minimumX, maximumY > minimumY else { return nil }

        return CGRect(
            x: minimumX,
            y: minimumY,
            width: maximumX - minimumX,
            height: maximumY - minimumY
        )
    }
}
