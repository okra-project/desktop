import PDFKit
import SwiftUI

struct PDFDocumentView: NSViewRepresentable {
    let url: URL
    let overlays: [PDFBoundingBoxOverlay]
    let showsOverlays: Bool
    let selectedOverlayID: String?
    let onOverlaySelection: (String) -> Void

    func makeCoordinator() -> PDFDocumentViewCoordinator {
        PDFDocumentViewCoordinator(onOverlaySelection: onOverlaySelection)
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
            overlays: showsOverlays ? overlays : [],
            selectedOverlayID: selectedOverlayID
        )
        return view
    }

    func updateNSView(_ view: PDFBoundingBoxView, context: Context) {
        context.coordinator.onOverlaySelection = onOverlaySelection
        if view.document?.documentURL?.standardizedFileURL != url.standardizedFileURL {
            context.coordinator.removeManagedAnnotations()
            view.document = PDFDocument(url: url)
            view.autoScales = true
        }
        context.coordinator.synchronize(
            document: view.document,
            overlays: showsOverlays ? overlays : [],
            selectedOverlayID: selectedOverlayID
        )
    }

    static func dismantleNSView(_ view: PDFBoundingBoxView, coordinator: PDFDocumentViewCoordinator) {
        coordinator.removeManagedAnnotations()
        view.handleOverlayClick = nil
    }
}
