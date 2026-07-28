import SwiftUI

struct WorkspaceToolInspectorView: View {
    let tool: WorkspaceToolDefinition
    let document: LocalPDFDocument?
    let importError: String?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    @ObservedObject var plugins: LocalPluginCoordinator
    let parse: () -> Void
    let openRun: (LocalProcessingRun) -> Void
    let revealPDF: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
                WorkspaceToolInspectorHeaderView(tool: tool)

                if let importError {
                    WorkspaceNoticeView(
                        message: importError,
                        systemImage: "exclamationmark.triangle.fill",
                        color: .red
                    )
                }

                toolContent
            }
            .padding(WorkspaceTheme.panelPadding)
        }
        .background(.background)
        .navigationTitle(tool.name)
    }

    @ViewBuilder
    private var toolContent: some View {
        if tool.id == .extract {
            ExtractionInspectorView(
                document: document,
                coordinator: coordinator,
                parse: parse,
                openRun: openRun,
                revealPDF: revealPDF
            )
        } else if tool.id == .presidioNER {
            PresidioInspectorView(
                coordinator: plugins,
                sourceRun: coordinator.latestRun
            )
        } else {
            WorkspaceNoticeView(
                message: "This local tool is not available in this build.",
                systemImage: "info.circle",
                color: .secondary
            )
        }
    }
}

private struct WorkspaceToolInspectorHeaderView: View {
    let tool: WorkspaceToolDefinition

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
            HStack(alignment: .firstTextBaseline) {
                Text(tool.name)
                    .font(.title2)
                    .bold()
                Spacer()
                Text(tool.registryLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.quaternary.opacity(0.35), in: .capsule)
            }

            Text(tool.summary)
                .font(.callout)
                .foregroundStyle(.secondary)

            Text("\(tool.category.rawValue) · \(tool.executionLabel)")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}
