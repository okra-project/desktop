import SwiftUI

struct EmptyDocumentView: View {
    let isDropTargeted: Bool
    let openPDF: () -> Void

    var body: some View {
        VStack(spacing: WorkspaceTheme.standardSpacing) {
            Text("PDF")
                .font(.headline)
                .foregroundStyle(WorkspaceTheme.brand)
                .padding(.horizontal, WorkspaceTheme.standardSpacing)
                .padding(.vertical, WorkspaceTheme.compactSpacing)
                .background(
                    WorkspaceTheme.brand.opacity(0.1),
                    in: .rect(cornerRadius: WorkspaceTheme.cardRadius)
                )
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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(WorkspaceTheme.panelPadding)
        .overlay {
            DropTargetOverlayView(isVisible: isDropTargeted)
        }
    }
}
