import SwiftUI

struct DocumentWorkspaceView: View {
    let document: LocalPDFDocument?
    let isDropTargeted: Bool
    let openPDF: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            DocumentWorkspaceHeaderView(document: document, revealPDF: revealPDF)
            Divider()

            if let document {
                ZStack {
                    PDFDocumentView(url: document.fileURL)
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
