import PDFKit
import SwiftUI

struct PDFDocumentView: NSViewRepresentable {
    let url: URL
    let overlays: [PDFBoundingBoxOverlay]
    let showsOverlays: Bool
    let selectedOverlayID: String?
    let hoveredOverlayID: String?
    let transientOverlayID: String?
    let onOverlaySelection: (String) -> Void
    let onOverlayHover: (String?) -> Void

    func makeCoordinator() -> PDFDocumentViewCoordinator {
        PDFDocumentViewCoordinator(
            onOverlaySelection: onOverlaySelection,
            onOverlayHover: onOverlayHover
        )
    }

    func makeNSView(context: Context) -> PDFBoundingBoxView {
        let view = PDFBoundingBoxView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.displaysPageBreaks = true
        view.backgroundColor = .windowBackgroundColor
        view.document = PDFDocument(url: url)
        context.coordinator.connect(to: view)
        context.coordinator.synchronize(
            document: view.document,
            overlays: visibleOverlays,
            selectedOverlayID: selectedOverlayID,
            hoveredOverlayID: hoveredOverlayID
        )
        return view
    }

    func updateNSView(_ view: PDFBoundingBoxView, context: Context) {
        context.coordinator.onOverlaySelection = onOverlaySelection
        context.coordinator.onOverlayHover = onOverlayHover
        if view.document?.documentURL?.standardizedFileURL != url.standardizedFileURL {
            context.coordinator.removeManagedAnnotations()
            view.document = PDFDocument(url: url)
            view.autoScales = true
        }
        context.coordinator.synchronize(
            document: view.document,
            overlays: visibleOverlays,
            selectedOverlayID: selectedOverlayID,
            hoveredOverlayID: hoveredOverlayID
        )
    }

    static func dismantleNSView(_ view: PDFBoundingBoxView, coordinator: PDFDocumentViewCoordinator) {
        coordinator.removeManagedAnnotations()
        view.handleOverlayClick = nil
        view.handleOverlayHover = nil
    }

    private var visibleOverlays: [PDFBoundingBoxOverlay] {
        if showsOverlays {
            overlays
        } else if let transientOverlayID {
            overlays.filter { $0.id == transientOverlayID }
        } else {
            []
        }
    }
}
