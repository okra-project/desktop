import SwiftUI

struct ExtractionInspectorView: View {
    let document: LocalPDFDocument?
    let importError: String?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let parse: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
                VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                    Text("Extract")
                        .font(.title2)
                        .bold()
                    Text("Choose a local parser, then parse only when you are ready.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let importError {
                    WorkspaceNoticeView(
                        message: importError,
                        systemImage: "exclamationmark.triangle.fill",
                        color: .red
                    )
                }

                LocalExtractionView(
                    document: document,
                    coordinator: coordinator,
                    parse: parse,
                    revealPDF: revealPDF
                )
            }
            .padding(WorkspaceTheme.panelPadding)
        }
        .background(.background)
        .navigationTitle("Extract")
    }
}
