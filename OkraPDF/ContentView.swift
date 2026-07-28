import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var state: AppState
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            workspaceContent
        }
    }

    private var workspaceContent: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            WorkspaceToolRegistryView(
                document: state.selectedDocument,
                registry: state.workspaceTools,
                selectedToolID: $state.selectedWorkspaceToolID,
                coordinator: state.localProcessing,
                plugins: state.localPlugins,
                openPDF: state.openPDFPicker
            )
            .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } content: {
            DocumentWorkspaceView(
                document: state.selectedDocument,
                isDropTargeted: isDropTargeted,
                coordinator: state.localProcessing,
                openPDF: state.openPDFPicker,
                revealPDF: state.revealSelectedPDF
            )
            .navigationSplitViewColumnWidth(min: 520, ideal: 720)
        } detail: {
            WorkspaceToolInspectorView(
                tool: selectedWorkspaceTool,
                document: state.selectedDocument,
                importError: state.importError,
                coordinator: state.localProcessing,
                plugins: state.localPlugins,
                parse: state.parseSelectedDocument,
                openRun: state.openRun,
                revealPDF: state.revealSelectedPDF
            )
            .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 500)
        }
        .navigationSplitViewStyle(.balanced)
        .tint(WorkspaceTheme.brand)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Open PDF", systemImage: "folder", action: state.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
                    .disabled(
                        state.localProcessing.isRunning
                            || state.localProcessing.isInstalling
                            || state.localPlugins.isRunning
                    )
            }
        }
        .onDrop(
            of: [UTType.fileURL.identifier],
            isTargeted: $isDropTargeted,
            perform: handleDrop
        )
    }

    private var selectedWorkspaceTool: WorkspaceToolDefinition {
        state.workspaceTools.tool(withID: state.selectedWorkspaceToolID)
            ?? state.workspaceTools.tools[0]
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard state.localProcessing.isRunning == false,
              state.localProcessing.isInstalling == false,
              state.localPlugins.isRunning == false,
              let provider = providers.first(where: {
                  $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
              }) else {
            return false
        }

        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
            guard let url = droppedFileURL(from: item) else { return }
            Task { @MainActor in
                state.openPDF(url)
            }
        }
        return true
    }

    private func droppedFileURL(from item: NSSecureCoding?) -> URL? {
        if let url = item as? URL {
            return url.standardizedFileURL
        }
        if let data = item as? Data {
            if let url = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NSURL.self, from: data) {
                return (url as URL).standardizedFileURL
            }
            if let string = String(data: data, encoding: .utf8) {
                return droppedFileURL(from: string as NSSecureCoding)
            }
        }
        if let string = item as? String {
            if let url = URL(string: string), url.isFileURL {
                return url.standardizedFileURL
            }
            return URL(fileURLWithPath: string).standardizedFileURL
        }
        return nil
    }
}
