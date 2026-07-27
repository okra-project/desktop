import SwiftUI

struct WorkspaceSidebarView: View {
    let document: LocalPDFDocument?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let openPDF: () -> Void
    let openRun: (LocalProcessingRun) -> Void

    var body: some View {
        List {
            Section {
                Button(action: openPDF) {
                    Label("Open PDF…", systemImage: "folder")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .disabled(coordinator.isRunning || coordinator.isInstalling)
            } header: {
                VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                    Text("okraPDF")
                        .font(.title2)
                        .bold()
                        .foregroundStyle(.primary)
                    Text("Private document workspace")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
                .padding(.bottom, WorkspaceTheme.compactSpacing)
            }

            Section("Document") {
                if let document {
                    CurrentDocumentRowView(document: document)
                } else {
                    Text("No PDF open")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Recent runs") {
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
                        }
                        .buttonStyle(.plain)
                        .disabled(coordinator.isRunning || coordinator.isInstalling)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Text("On this Mac")
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Show Runs", action: coordinator.revealRunsFolder)
                    .buttonStyle(.plain)
            }
            .font(.callout)
            .padding(.horizontal, WorkspaceTheme.panelPadding)
            .padding(.vertical, WorkspaceTheme.standardSpacing)
            .background(.bar)
        }
        .navigationTitle("Workspace")
    }
}
