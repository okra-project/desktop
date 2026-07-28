import AppKit
import PDFKit

final class PDFBoundingBoxView: PDFView {
    var handleOverlayClick: ((PDFPage, CGPoint) -> Bool)?
    var handleOverlayHover: ((PDFPage?, CGPoint?) -> Void)?

    private var overlayTrackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        if let overlayTrackingArea {
            removeTrackingArea(overlayTrackingArea)
        }
        super.updateTrackingAreas()

        let trackingArea = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .mouseMoved, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
        overlayTrackingArea = trackingArea
    }

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

    override func mouseEntered(with event: NSEvent) {
        updateOverlayHover(with: event)
        super.mouseEntered(with: event)
    }

    override func mouseMoved(with event: NSEvent) {
        updateOverlayHover(with: event)
        super.mouseMoved(with: event)
    }

    override func mouseExited(with event: NSEvent) {
        handleOverlayHover?(nil, nil)
        super.mouseExited(with: event)
    }

    override func scrollWheel(with event: NSEvent) {
        super.scrollWheel(with: event)
        updateOverlayHover(with: event)
    }

    override func magnify(with event: NSEvent) {
        super.magnify(with: event)
        updateOverlayHover(with: event)
    }

    private func updateOverlayHover(with event: NSEvent) {
        let viewPoint = convert(event.locationInWindow, from: nil)
        guard let page = page(for: viewPoint, nearest: false) else {
            handleOverlayHover?(nil, nil)
            return
        }
        handleOverlayHover?(page, convert(viewPoint, to: page))
    }
}
