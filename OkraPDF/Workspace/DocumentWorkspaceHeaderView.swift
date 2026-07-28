import SwiftUI

struct DocumentWorkspaceHeaderView: View {
    let document: LocalPDFDocument?
    let boundingBoxCount: Int
    @Binding var showsBoundingBoxes: Bool
    let revealPDF: () -> Void

    var body: some View {
        HStack(spacing: WorkspaceTheme.standardSpacing) {
            VStack(alignment: .leading, spacing: 3) {
                Text(document?.fileName ?? "PDF reader")
                    .font(.headline)
                    .lineLimit(1)
                Text(document.map { "^[\($0.totalPages) page](inflect: true) · reading does not start parsing" }
                     ?? "Open or drop a PDF to begin")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if document != nil {
                if boundingBoxCount > 0 {
                    Toggle(isOn: $showsBoundingBoxes) {
                        Label("Show extraction boxes", systemImage: "viewfinder.rectangular")
                    }
                    .toggleStyle(.button)
                    .labelStyle(.iconOnly)
                    .help(showsBoundingBoxes ? "Hide extraction boxes" : "Show extraction boxes")
                    .accessibilityValue(
                        showsBoundingBoxes
                            ? "\(boundingBoxCount) extraction boxes visible"
                            : "Hidden"
                    )
                }

                Button("Reveal in Finder", systemImage: "arrow.forward.circle", action: revealPDF)
                    .labelStyle(.iconOnly)
                    .help("Reveal the source PDF in Finder")
            }
        }
        .padding(.horizontal, WorkspaceTheme.panelPadding)
        .padding(.vertical, WorkspaceTheme.standardSpacing)
        .background(.bar)
    }
}
