import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var state: AppState
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isDropTargeted = false

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            WorkspaceSidebarView(
                document: state.selectedDocument,
                coordinator: state.localProcessing,
                openPDF: state.openPDFPicker,
                openRun: state.openRun
            )
            .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } content: {
            DocumentWorkspaceView(
                document: state.selectedDocument,
                isDropTargeted: isDropTargeted,
                openPDF: state.openPDFPicker,
                revealPDF: state.revealSelectedPDF
            )
            .navigationSplitViewColumnWidth(min: 520, ideal: 720)
        } detail: {
            ExtractionInspectorView(
                document: state.selectedDocument,
                importError: state.importError,
                coordinator: state.localProcessing,
                parse: state.parseSelectedDocument,
                revealPDF: state.revealSelectedPDF
            )
            .navigationSplitViewColumnWidth(min: 320, ideal: 370, max: 460)
        }
        .navigationSplitViewStyle(.balanced)
        .tint(WorkspaceTheme.brand)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Open PDF", systemImage: "folder", action: state.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
                    .disabled(state.localProcessing.isRunning || state.localProcessing.isInstalling)
            }
        }
        .onDrop(
            of: [UTType.fileURL.identifier],
            isTargeted: $isDropTargeted,
            perform: handleDrop
        )
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard state.localProcessing.isRunning == false,
              state.localProcessing.isInstalling == false,
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
