import PDFKit

final class PDFBoundingBoxView: PDFView {
    var handleOverlayClick: ((PDFPage, CGPoint) -> Bool)?

    override func mouseDown(with event: NSEvent) {
        let viewPoint = convert(event.locationInWindow, from: nil)
        if let page = page(for: viewPoint, nearest: false) {
            let pagePoint = convert(viewPoint, to: page)
            if handleOverlayClick?(page, pagePoint) == true {
                return
            }
        }
        super.mouseDown(with: event)
    }
}
