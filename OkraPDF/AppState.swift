import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var selectedDocument: LocalPDFDocument?
    @Published var importError: String?
    @Published var selectedWorkspaceToolID: WorkspaceToolID

    let localProcessing: LocalProcessingCoordinator
    let workspaceTools: WorkspaceToolRegistry

    init() {
        localProcessing = LocalProcessingCoordinator()
        workspaceTools = .standard
        selectedWorkspaceToolID = workspaceTools.resolvedSelection(nil)
        openCommandLinePDFIfPresent()
    }

    init(
        localProcessing: LocalProcessingCoordinator,
        workspaceTools: WorkspaceToolRegistry = .standard,
        selectedWorkspaceToolID: WorkspaceToolID? = nil
    ) {
        self.localProcessing = localProcessing
        self.workspaceTools = workspaceTools
        self.selectedWorkspaceToolID = workspaceTools.resolvedSelection(selectedWorkspaceToolID)
    }

    func openPDFPicker() {
        let panel = NSOpenPanel()
        panel.title = "Open PDF"
        panel.prompt = "Open"
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true

        NSApplication.shared.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        openPDF(url)
    }

    func openPDF(_ url: URL) {
        importError = nil

        guard url.isFileURL, url.pathExtension.lowercased() == UTType.pdf.preferredFilenameExtension else {
            importError = "Choose a PDF file."
            return
        }

        let normalizedURL = url.standardizedFileURL
        guard FileManager.default.fileExists(atPath: normalizedURL.path),
              let pdf = PDFDocument(url: normalizedURL),
              pdf.pageCount > 0 else {
            importError = "Could not open \(url.lastPathComponent)."
            return
        }

        let document = LocalPDFDocument(
            id: normalizedURL.path,
            fileName: normalizedURL.lastPathComponent,
            filePath: normalizedURL.path,
            totalPages: pdf.pageCount
        )
        selectedDocument = document
        localProcessing.load(document: document)
    }

    func parseSelectedDocument() {
        guard let selectedDocument else { return }
        localProcessing.run(document: selectedDocument)
    }

    func openRun(_ run: LocalProcessingRun) {
        let sourceURL = URL(fileURLWithPath: run.sourcePath).standardizedFileURL
        if FileManager.default.fileExists(atPath: sourceURL.path) {
            openPDF(sourceURL)
        } else {
            importError = "The original PDF for \(run.fileName) is no longer at \(run.sourcePath)."
        }
        localProcessing.selectRun(run)
    }

    func revealSelectedPDF() {
        guard let selectedDocument else { return }
        NSWorkspace.shared.activateFileViewerSelecting([
            selectedDocument.fileURL,
        ])
    }

    func quit() {
        NSApplication.shared.terminate(nil)
    }

    private func openCommandLinePDFIfPresent() {
        guard let path = ProcessInfo.processInfo.arguments
            .dropFirst()
            .first(where: { $0.lowercased().hasSuffix(".pdf") }) else {
            return
        }
        openPDF(URL(fileURLWithPath: path))
    }
}
