import SwiftUI

struct ExtractionOutputView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            Divider()
            HStack {
                Text("Extracted Markdown")
                    .font(.headline)
                Spacer()
                Button("Copy", action: coordinator.copyOutput)
                    .buttonStyle(.plain)
                Button("Save…", action: coordinator.saveOutputAs)
                    .buttonStyle(.plain)
                Button("Reveal", action: coordinator.revealOutput)
                    .buttonStyle(.plain)
            }

            ScrollView {
                Text(coordinator.outputText)
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(WorkspaceTheme.standardSpacing)
            }
            .frame(minHeight: 180, maxHeight: 300)
            .background(.quaternary.opacity(0.2), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
        }
    }
}
