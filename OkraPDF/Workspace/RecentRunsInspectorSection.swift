import SwiftUI

struct RecentRunsInspectorSection: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let openRun: (LocalProcessingRun) -> Void
    @State private var isExpanded = false

    var body: some View {
        Divider()

        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
                if coordinator.recentRuns.isEmpty {
                    Text("Completed parses appear here.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(coordinator.recentRuns) { run in
                        Button {
                            openRun(run)
                        } label: {
                            RunHistoryRowView(run: run)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .disabled(coordinator.isRunning || coordinator.isInstalling)
                    }
                }

                Button("Show Runs in Finder", action: coordinator.revealRunsFolder)
                    .buttonStyle(.bordered)
            }
            .padding(.top, WorkspaceTheme.standardSpacing)
        } label: {
            HStack {
                Text("Run history")
                    .font(.headline)
                Spacer()
                Text("\(coordinator.recentRuns.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityHint("Shows local extraction runs")
    }
}
