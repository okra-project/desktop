import AppKit
import Foundation
import UniformTypeIdentifiers

@MainActor
final class LocalProcessingCoordinator: ObservableObject {
    @Published var selectedProviderID: LocalProviderID {
        didSet {
            userDefaults.set(selectedProviderID.rawValue, forKey: Self.providerDefaultsKey)
            refreshAvailability()
            guard !isRunning, !isInstalling else { return }
            setupProgress = nil
            setupErrorMessage = nil
            statusMessage = selectedAvailability.isReady
                ? "\(selectedDescriptor.name) is ready offline."
                : selectedAvailability.message
            progress = 0
        }
    }
    @Published private(set) var availabilityByProvider: [LocalProviderID: LocalProviderAvailability] = [:]
    @Published private(set) var latestRun: LocalProcessingRun?
    @Published private(set) var recentRuns: [LocalProcessingRun] = []
    @Published private(set) var outputText = ""
    @Published private(set) var progress = 0.0
    @Published private(set) var statusMessage = "Choose a local parser and extract."
    @Published private(set) var isRunning = false
    @Published private(set) var isInstalling = false
    @Published private(set) var setupProgress: LocalProviderSetupProgress?
    @Published private(set) var setupErrorMessage: String?

    private static let providerDefaultsKey = "localProcessing.selectedProvider"
    private let providers: [any LocalProcessingProvider]
    private let runsRoot: URL
    private let userDefaults: UserDefaults
    private var currentSourcePath: String?
    private var currentFileName = "extraction.pdf"
    private var installationTask: Task<Void, Never>?

    init(
        providers: [any LocalProcessingProvider] = [
            AppleVisionProcessingProvider(),
            DoclingProcessingProvider(),
            UnlimitedOCRProcessingProvider(),
        ],
        runsRoot: URL = LocalProviderPaths.runsRoot,
        userDefaults: UserDefaults = .standard
    ) {
        self.providers = providers
        self.runsRoot = runsRoot
        self.userDefaults = userDefaults

        if providers.first(where: { $0.descriptor.id == .unlimitedOCR })?.availability().isSimulated == true {
            selectedProviderID = .unlimitedOCR
        } else if let stored = userDefaults.string(forKey: Self.providerDefaultsKey),
           let providerID = LocalProviderID(rawValue: stored),
           providers.contains(where: { $0.descriptor.id == providerID }) {
            selectedProviderID = providerID
        } else if providers.first(where: { $0.descriptor.id == .unlimitedOCR })?.availability().isReady == true {
            selectedProviderID = .unlimitedOCR
        } else if providers.contains(where: { $0.descriptor.id == .appleVision }) {
            selectedProviderID = .appleVision
        } else if let firstProvider = providers.first {
            selectedProviderID = firstProvider.descriptor.id
        } else {
            preconditionFailure("LocalProcessingCoordinator requires at least one provider.")
        }

        refreshAvailability()
        refreshRecentRuns()
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
        setupErrorMessage = nil
        refreshAvailability()
        refreshRecentRuns()
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
        setupErrorMessage = nil
        setupProgress = LocalProviderSetupProgress(
            phase: .preparing,
            fraction: nil,
            message: "Preparing \(provider.descriptor.name)…"
        )
        statusMessage = "Setting up \(provider.descriptor.name)…"

        installationTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await provider.install { [weak self] update in
                    Task { @MainActor in
                        guard let self, self.isInstalling else { return }
                        self.setupProgress = update
                        self.statusMessage = update.message
                    }
                }
                self.refreshAvailability()
                self.setupProgress = LocalProviderSetupProgress(
                    phase: .ready,
                    fraction: 1,
                    message: "\(provider.descriptor.name) is ready offline."
                )
                self.statusMessage = "\(provider.descriptor.name) is ready offline."
            } catch is CancellationError {
                self.setupProgress = nil
                self.statusMessage = "Setup canceled. You can resume when you are ready."
            } catch {
                self.setupErrorMessage = error.localizedDescription
                self.setupProgress = nil
                self.statusMessage = error.localizedDescription
            }
            self.isInstalling = false
            self.installationTask = nil
        }
    }

    func cancelInstallation() {
        guard isInstalling else { return }
        statusMessage = "Canceling setup after the current operation…"
        installationTask?.cancel()
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
            executionMode: provider.availability().isSimulated ? "simulation" : "local",
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
            refreshRecentRuns()
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
                refreshRecentRuns()

                if currentSourcePath == document.filePath {
                    latestRun = run
                    progress = 1
                    statusMessage = provider.availability().isSimulated
                        ? "Simulation complete · model weights were not loaded."
                        : "Parsed locally with \(provider.descriptor.name)."
                    loadOutputText()
                }
            } catch {
                run.status = "failed"
                run.errorMessage = error.localizedDescription
                run.completedAt = Date()
                try? persist(run, in: runDirectory)
                refreshRecentRuns()

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

    func selectRun(_ run: LocalProcessingRun) {
        latestRun = run
        currentSourcePath = run.sourcePath
        currentFileName = run.fileName
        progress = run.status == "succeeded" ? 1 : 0
        statusMessage = run.status == "succeeded"
            ? "Parsed locally with \(run.providerName)."
            : run.errorMessage ?? "This run did not finish."
        loadOutputText()
    }

    func refreshRecentRuns() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let runDirectories = try? FileManager.default.contentsOfDirectory(
            at: runsRoot,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            recentRuns = []
            return
        }

        recentRuns = runDirectories.compactMap { runDirectory in
            let manifestURL = runDirectory.appendingPathComponent("run.json")
            guard let data = try? Data(contentsOf: manifestURL) else { return nil }
            return try? decoder.decode(LocalProcessingRun.self, from: data)
        }
        .sorted { $0.startedAt > $1.startedAt }
        .prefix(12)
        .map { $0 }
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
