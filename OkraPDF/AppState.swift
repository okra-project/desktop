import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var selectedDocument: LocalPDFDocument?
    @Published private(set) var pdfDocument: PDFDocument?
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
        panel.prompt = "Open"
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true

        NSApplication.shared.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        openPDF(url)
    }

    @discardableResult
    func openPDF(_ url: URL) -> Bool {
        importError = nil

        guard url.isFileURL, url.pathExtension.lowercased() == UTType.pdf.preferredFilenameExtension else {
            importError = "Choose a PDF file."
            return false
        }

        let normalizedURL = url.standardizedFileURL
        guard FileManager.default.fileExists(atPath: normalizedURL.path),
              let pdf = PDFDocument(url: normalizedURL),
              pdf.pageCount > 0 else {
            importError = "okraPDF could not open \(url.lastPathComponent)."
            return false
        }

        let document = LocalPDFDocument(
            id: normalizedURL.path,
            fileName: normalizedURL.lastPathComponent,
            filePath: normalizedURL.path,
            totalPages: pdf.pageCount
        )
        selectedDocument = document
        pdfDocument = pdf
        localProcessing.load(document: document)
        return true
    }

    func parseSelectedDocument() {
        guard let selectedDocument else { return }
        localProcessing.run(document: selectedDocument)
    }

    func revealSelectedPDF() {
        guard let selectedDocument else { return }
        NSWorkspace.shared.activateFileViewerSelecting([
            selectedDocument.fileURL,
        ])
    }

}
