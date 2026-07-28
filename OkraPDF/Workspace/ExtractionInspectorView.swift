import SwiftUI

struct ExtractionInspectorView: View {
    let document: LocalPDFDocument?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let parse: () -> Void
    let openRun: (LocalProcessingRun) -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
            Text("Choose a local parser, set it up once, then parse only when you are ready.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LocalExtractionView(
                document: document,
                coordinator: coordinator,
                parse: parse,
                revealPDF: revealPDF
            )

            RecentRunsInspectorSection(
                coordinator: coordinator,
                openRun: openRun
            )
        }
    }
}
