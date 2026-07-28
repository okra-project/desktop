import CoreGraphics

extension StructuredExtractionBoundingBox {
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
