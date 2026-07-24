import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var selectedDocument: LocalPDFDocument?
    @Published var importError: String?

    let localProcessing: LocalProcessingCoordinator

    init() {
        localProcessing = LocalProcessingCoordinator()
    }

    init(localProcessing: LocalProcessingCoordinator) {
        self.localProcessing = localProcessing
    }

    func openPDFPicker() {
        let panel = NSOpenPanel()
        panel.title = "Open PDF"
        panel.prompt = "Extract"
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true

        NSApplication.shared.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        openAndExtract(url)
    }

    func openAndExtract(_ url: URL) {
        importError = nil

        guard url.isFileURL, url.pathExtension.lowercased() == UTType.pdf.preferredFilenameExtension else {
            importError = "Choose a PDF file."
            return
        }

        let normalizedURL = url.standardizedFileURL
        guard FileManager.default.fileExists(atPath: normalizedURL.path),
              let pdf = PDFDocument(url: normalizedURL),
              pdf.pageCount > 0 else {
            importError = "okraPDF could not open \(url.lastPathComponent)."
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
        localProcessing.run(document: document)
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
}
