import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers

func desktopBundleVersion() -> String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
}

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var selectedDocument: LocalPDFDocument?
    @Published var importError: String?
    @Published private(set) var updateStatus: DesktopUpdateStatus = .unknown
    @Published private(set) var manualUpdateCheckNotice: String?

    let localProcessing: LocalProcessingCoordinator

    private static let lastUpdateCheckDefaultsKey = "updateCheck.lastCheckAt"
    private static let dismissedUpdateTagDefaultsKey = "updateCheck.dismissedTag"
    private static let updateCheckInterval: TimeInterval = 24 * 60 * 60

    private let updateChecker: DesktopUpdateChecker
    private let currentAppVersion: String
    private let updateDefaults: UserDefaults

    init() {
        localProcessing = LocalProcessingCoordinator()
        updateChecker = DesktopUpdateChecker()
        currentAppVersion = desktopBundleVersion()
        updateDefaults = .standard
        openCommandLinePDFIfPresent()
    }

    init(
        localProcessing: LocalProcessingCoordinator,
        updateChecker: DesktopUpdateChecker = DesktopUpdateChecker(),
        currentAppVersion: String = desktopBundleVersion(),
        updateDefaults: UserDefaults = .standard
    ) {
        self.localProcessing = localProcessing
        self.updateChecker = updateChecker
        self.currentAppVersion = currentAppVersion
        self.updateDefaults = updateDefaults
    }

    /// A newer beta the user has not dismissed yet.
    var visibleUpdate: DesktopUpdate? {
        guard case .updateAvailable(let update) = updateStatus,
              update.tag != updateDefaults.string(forKey: Self.dismissedUpdateTagDefaultsKey) else {
            return nil
        }
        return update
    }

    func checkForUpdatesIfDue() async {
        let lastCheck = updateDefaults.object(forKey: Self.lastUpdateCheckDefaultsKey) as? Date
        if let lastCheck, Date().timeIntervalSince(lastCheck) < Self.updateCheckInterval {
            return
        }
        await checkForUpdates()
    }

    func checkForUpdates(manual: Bool = false) async {
        if manual {
            manualUpdateCheckNotice = nil
        }
        updateStatus = .checking
        let result = await updateChecker.check(currentVersion: currentAppVersion)
        updateStatus = result
        updateDefaults.set(Date(), forKey: Self.lastUpdateCheckDefaultsKey)

        guard manual else { return }
        switch result {
        case .upToDate:
            manualUpdateCheckNotice = "You're running the latest Okra Desktop beta (\(currentAppVersion))."
        case .unknown:
            manualUpdateCheckNotice = "Could not check for updates right now. The release page always lists the newest beta."
        case .checking, .updateAvailable:
            manualUpdateCheckNotice = nil
        }
    }

    func dismissUpdateBanner() {
        if case .updateAvailable(let update) = updateStatus {
            updateDefaults.set(update.tag, forKey: Self.dismissedUpdateTagDefaultsKey)
        }
        manualUpdateCheckNotice = nil
    }

    func openUpdateRelease() {
        guard let update = visibleUpdate else { return }
        NSWorkspace.shared.open(update.url)
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
