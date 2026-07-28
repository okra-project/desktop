import SwiftUI

struct DocumentWorkspaceView: View {
    let document: LocalPDFDocument?
    let isDropTargeted: Bool
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let openPDF: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            DocumentWorkspaceHeaderView(
                document: document,
                boundingBoxCount: coordinator.pdfBoundingBoxOverlays.count,
                showsBoundingBoxes: $coordinator.showsPDFBoundingBoxes,
                revealPDF: revealPDF
            )
            Divider()

            if let document {
                ZStack {
                    PDFDocumentView(
                        url: document.fileURL,
                        overlays: coordinator.pdfBoundingBoxOverlays,
                        showsOverlays: coordinator.showsPDFBoundingBoxes,
                        selectedOverlayID: coordinator.selectedStructuredBlockID,
                        hoveredOverlayID: coordinator.hoveredStructuredBlockID,
                        transientOverlayID: coordinator.previewHoveredStructuredBlockID,
                        onOverlaySelection: coordinator.selectStructuredBlock,
                        onOverlayHover: coordinator.hoverPDFOverlay
                    )
                    DropTargetOverlayView(isVisible: isDropTargeted)
                }
                .accessibilityLabel("PDF preview for \(document.fileName)")
            } else {
                EmptyDocumentView(isDropTargeted: isDropTargeted, openPDF: openPDF)
            }
        }
        .navigationTitle(document?.fileName ?? "Reader")
    }
}
