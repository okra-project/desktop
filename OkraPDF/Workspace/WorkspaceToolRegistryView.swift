import SwiftUI

struct WorkspaceToolRegistryView: View {
    let document: LocalPDFDocument?
    let registry: WorkspaceToolRegistry
    @Binding var selectedToolID: WorkspaceToolID
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let openPDF: () -> Void

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
                    BrandMarkView()
                    Text("Private document workspace")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
                .padding(.bottom, WorkspaceTheme.compactSpacing)
            }

            Section("Current PDF") {
                if let document {
                    CurrentDocumentRowView(document: document)
                } else {
                    Text("No PDF open")
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(registry.categories) { category in
                Section(category.rawValue) {
                    ForEach(registry.tools(in: category)) { tool in
                        WorkspaceToolRegistryRow(
                            tool: tool,
                            isSelected: selectedToolID == tool.id,
                            statusLabel: tool.id == .extract ? extractionStatusLabel : tool.registryLabel,
                            statusIsActive: tool.id == .extract
                                && (coordinator.isRunning || coordinator.selectedAvailability.isReady)
                        ) {
                            selectedToolID = tool.id
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Text("Tools run on this Mac")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(registry.tools.count == 1 ? "1 tool" : "\(registry.tools.count) tools")
                    .foregroundStyle(.tertiary)
            }
            .font(.callout)
            .padding(.horizontal, WorkspaceTheme.panelPadding)
            .padding(.vertical, WorkspaceTheme.standardSpacing)
            .background(.bar)
        }
        .navigationTitle("Tools")
    }

    private var extractionStatusLabel: String {
        if coordinator.isRunning {
            return "Running"
        }
        if coordinator.isInstalling {
            return "Setting up"
        }
        return coordinator.selectedAvailability.isReady ? "Ready" : "Setup required"
    }
}

private struct WorkspaceToolRegistryRow: View {
    let tool: WorkspaceToolDefinition
    let isSelected: Bool
    let statusLabel: String
    let statusIsActive: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(alignment: .top, spacing: WorkspaceTheme.standardSpacing) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(isSelected ? WorkspaceTheme.brand : .clear)
                    .frame(width: 3)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(tool.name)
                            .font(.headline)
                        Spacer()
                        Text(statusLabel)
                            .font(.caption)
                            .foregroundStyle(statusIsActive ? WorkspaceTheme.brand : .secondary)
                    }
                    Text(tool.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(tool.executionLabel)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 4)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .listRowBackground(isSelected ? WorkspaceTheme.brand.opacity(0.1) : Color.clear)
        .accessibilityLabel("\(tool.name), \(tool.summary)")
        .accessibilityValue(isSelected ? "Selected, \(statusLabel)" : statusLabel)
    }
}
