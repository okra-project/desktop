import AppKit
import Foundation
import UniformTypeIdentifiers

@MainActor
final class LocalProcessingCoordinator: ObservableObject {
    @Published var selectedProviderID: LocalProviderID {
        didSet {
            UserDefaults.standard.set(selectedProviderID.rawValue, forKey: Self.providerDefaultsKey)
            refreshAvailability()
            guard !isRunning, !isInstalling else { return }
            statusMessage = selectedAvailability.isReady
                ? "\(selectedDescriptor.name) is ready offline."
                : selectedAvailability.message
            progress = 0
        }
    }
    @Published private(set) var availabilityByProvider: [LocalProviderID: LocalProviderAvailability] = [:]
    @Published private(set) var latestRun: LocalProcessingRun?
    @Published private(set) var outputText = ""
    @Published private(set) var progress = 0.0
    @Published private(set) var statusMessage = "Choose a local parser and extract."
    @Published private(set) var isRunning = false
    @Published private(set) var isInstalling = false

    private static let providerDefaultsKey = "localProcessing.selectedProvider"
    private let providers: [any LocalProcessingProvider]
    private let runsRoot: URL
    private var currentSourcePath: String?
    private var currentFileName = "extraction.pdf"

    init(
        providers: [any LocalProcessingProvider] = [
            AppleVisionProcessingProvider(),
            DoclingProcessingProvider(),
            UnlimitedOCRProcessingProvider(),
        ],
        runsRoot: URL = LocalProviderPaths.runsRoot
    ) {
        self.providers = providers
        self.runsRoot = runsRoot

        if let stored = UserDefaults.standard.string(forKey: Self.providerDefaultsKey),
           let providerID = LocalProviderID(rawValue: stored),
           providers.contains(where: { $0.descriptor.id == providerID }) {
            selectedProviderID = providerID
        } else if providers.first(where: { $0.descriptor.id == .unlimitedOCR })?.availability().isReady == true {
            selectedProviderID = .unlimitedOCR
        } else {
            selectedProviderID = .appleVision
        }

        refreshAvailability()
    }

    var descriptors: [LocalProviderDescriptor] {
        providers.map(\.descriptor)
    }

    var selectedDescriptor: LocalProviderDescriptor {
        provider(for: selectedProviderID)?.descriptor ?? providers[0].descriptor
    }

    var selectedAvailability: LocalProviderAvailability {
        availabilityByProvider[selectedProviderID] ?? .unavailable("Unavailable")
    }

    var outputURL: URL? {
        guard let outputPath = latestRun?.outputPath else { return nil }
        return URL(fileURLWithPath: outputPath)
    }

    func load(document: LocalPDFDocument) {
        currentSourcePath = document.filePath
        currentFileName = document.fileName
        latestRun = nil
        outputText = ""
        progress = 0
        refreshAvailability()
        statusMessage = selectedAvailability.isReady
            ? "Ready to parse with \(selectedDescriptor.name)."
            : selectedAvailability.message
    }

    func refreshAvailability() {
        availabilityByProvider = Dictionary(
            uniqueKeysWithValues: providers.map { ($0.descriptor.id, $0.availability()) }
        )
    }

    func installSelectedProvider() {
        guard !isInstalling, let provider = provider(for: selectedProviderID) else { return }
        isInstalling = true
        progress = 0
        statusMessage = "Setting up \(provider.descriptor.name)…"

        Task {
            do {
                try await provider.install()
                refreshAvailability()
                statusMessage = "\(provider.descriptor.name) is ready offline."
            } catch {
                statusMessage = error.localizedDescription
            }
            isInstalling = false
        }
    }

    func run(document: LocalPDFDocument) {
        guard !isRunning else {
            statusMessage = "Another extraction is already running."
            return
        }
        guard let provider = provider(for: selectedProviderID) else {
            statusMessage = "The selected parser is unavailable."
            return
        }
        guard provider.availability().isReady else {
            statusMessage = provider.availability().message
            return
        }

        let runID = UUID().uuidString
        let runDirectory = LocalProviderPaths.runDirectory(runsRoot: runsRoot, runID: runID)
        var run = LocalProcessingRun(
            id: runID,
            sourcePath: document.filePath,
            fileName: document.fileName,
            providerId: provider.descriptor.id.rawValue,
            providerName: provider.descriptor.name,
            status: "running",
            outputPath: nil,
            errorMessage: nil,
            pageCount: 0,
            startedAt: Date(),
            completedAt: nil
        )

        do {
            try FileManager.default.createDirectory(at: runDirectory, withIntermediateDirectories: true)
            try persist(run, in: runDirectory)
        } catch {
            statusMessage = "Could not start extraction: \(error.localizedDescription)"
            return
        }

        currentSourcePath = document.filePath
        currentFileName = document.fileName
        latestRun = run
        outputText = ""
        progress = 0
        isRunning = true
        statusMessage = "Starting \(provider.descriptor.name)…"

        let request = LocalProcessingRequest(
            fileName: document.fileName,
            sourceURL: document.fileURL,
            outputDirectory: runDirectory,
            expectedPageCount: document.totalPages
        )

        Task {
            do {
                let result = try await provider.process(request: request) { [weak self] fraction, message in
                    Task { @MainActor in
                        guard let self, self.latestRun?.id == runID else { return }
                        self.progress = min(max(fraction, 0), 1)
                        self.statusMessage = message
                    }
                }
                run.status = "succeeded"
                run.outputPath = result.outputURL.path
                run.pageCount = result.pageCount
                run.completedAt = Date()
                try persist(run, in: runDirectory)

                if currentSourcePath == document.filePath {
                    latestRun = run
                    progress = 1
                    statusMessage = "Parsed locally with \(provider.descriptor.name)."
                    loadOutputText()
                }
            } catch {
                run.status = "failed"
                run.errorMessage = error.localizedDescription
                run.completedAt = Date()
                try? persist(run, in: runDirectory)

                if currentSourcePath == document.filePath {
                    latestRun = run
                    statusMessage = error.localizedDescription
                }
            }
            isRunning = false
        }
    }

    func revealRunsFolder() {
        try? FileManager.default.createDirectory(at: runsRoot, withIntermediateDirectories: true)
        NSWorkspace.shared.open(runsRoot)
    }

    func revealOutput() {
        guard let outputURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([outputURL])
    }

    func copyOutput() {
        guard !outputText.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(outputText, forType: .string)
        statusMessage = "Copied Markdown."
    }

    func saveOutputAs() {
        guard !outputText.isEmpty else { return }

        let panel = NSSavePanel()
        panel.title = "Save Extracted Markdown"
        panel.prompt = "Save"
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: currentFileName).deletingPathExtension().lastPathComponent).md"

        NSApplication.shared.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let destination = panel.url else { return }

        do {
            try outputText.write(to: destination, atomically: true, encoding: .utf8)
            statusMessage = "Saved Markdown."
        } catch {
            statusMessage = "Could not save Markdown: \(error.localizedDescription)"
        }
    }

    private func provider(for id: LocalProviderID) -> (any LocalProcessingProvider)? {
        providers.first { $0.descriptor.id == id }
    }

    private func persist(_ run: LocalProcessingRun, in runDirectory: URL) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(run)
        try data.write(to: runDirectory.appendingPathComponent("run.json"), options: .atomic)
    }

    private func loadOutputText() {
        guard let outputURL else {
            outputText = ""
            return
        }
        outputText = (try? String(contentsOf: outputURL, encoding: .utf8)) ?? ""
    }
}
