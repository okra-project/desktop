import SwiftUI

struct EmptyDocumentView: View {
    let isDropTargeted: Bool
    let canOpenPDF: Bool
    let openPDF: () -> Void

    var body: some View {
        VStack(spacing: WorkspaceTheme.standardSpacing) {
            BrandMarkView(size: 52)
                .accessibilityHidden(true)

            Text("Open a PDF to read and parse")
                .font(.title2)
                .bold()
            Text("Drop a file anywhere in this window. The original stays exactly where it is, and parsing starts only when you ask.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 430)
            Button("Open PDF…", action: openPDF)
                .buttonStyle(.borderedProminent)
                .disabled(canOpenPDF == false)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(WorkspaceTheme.panelPadding)
        .overlay {
            DropTargetOverlayView(isVisible: isDropTargeted)
        }
    }
}
