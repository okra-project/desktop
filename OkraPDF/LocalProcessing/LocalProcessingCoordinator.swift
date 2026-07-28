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
    @Published private(set) var structuredOutputText = ""
    @Published private(set) var structuredOutput: StructuredExtractionDocument?
    @Published private(set) var selectedStructuredBlockID: String?
    @Published var showsPDFBoundingBoxes = true
    @Published private(set) var progress = 0.0
    @Published private(set) var completedPageCount = 0
    @Published private(set) var totalPageCount = 0
    @Published private(set) var statusMessage = "Choose a local parser and extract."
    @Published private(set) var isRunning = false
    @Published private(set) var isInstalling = false
    @Published private(set) var setupProgress: LocalProviderSetupProgress?
    @Published private(set) var setupErrorMessage: String?
    @Published private(set) var runHealthMessage: String?

    private static let providerDefaultsKey = "localProcessing.selectedProvider"
    private let providers: [any LocalProcessingProvider]
    private let runsRoot: URL
    private let userDefaults: UserDefaults
    private let memorySampler: @Sendable () -> SystemMemoryStatus
    private let stallThreshold: TimeInterval
    private let healthPollInterval: TimeInterval
    private var currentSourcePath: String?
    private var currentFileName = "extraction.pdf"
    private var installationTask: Task<Void, Never>?
    private var processingTask: Task<Void, Never>?
    private var healthMonitorTask: Task<Void, Never>?
    private var activeRun: LocalProcessingRun?
    private var lastProgressEventAt = Date()

    init(
        providers: [any LocalProcessingProvider] = [
            AppleVisionProcessingProvider(),
            DoclingProcessingProvider(),
            UnlimitedOCRProcessingProvider(),
        ],
        runsRoot: URL = LocalProviderPaths.runsRoot,
        userDefaults: UserDefaults = .standard,
        memorySampler: @escaping @Sendable () -> SystemMemoryStatus = SystemMemorySampler.sample,
        stallThreshold: TimeInterval = 90,
        healthPollInterval: TimeInterval = 5
    ) {
        self.providers = providers
        self.runsRoot = runsRoot
        self.userDefaults = userDefaults
        self.memorySampler = memorySampler
        self.stallThreshold = stallThreshold
        self.healthPollInterval = healthPollInterval

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
        recoverOrphanedRuns()
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

    var structuredOutputURL: URL? {
        guard let structuredOutputPath = latestRun?.structuredOutputPath else { return nil }
        return URL(fileURLWithPath: structuredOutputPath)
    }

    var pdfBoundingBoxOverlays: [PDFBoundingBoxOverlay] {
        guard latestRun?.providerId == LocalProviderID.unlimitedOCR.rawValue,
              latestRun?.status == "succeeded" else {
            return []
        }
        return structuredOutput?.unlimitedOCRPDFOverlays ?? []
    }

    var canResumeLatestRun: Bool {
        guard !isRunning,
              !isInstalling,
              let run = latestRun,
              ["canceled", "failed", "interrupted"].contains(run.status),
              FileManager.default.fileExists(atPath: run.sourcePath),
              let providerID = LocalProviderID(rawValue: run.providerId),
              let provider = provider(for: providerID) else {
            return false
        }
        return provider.availability().isReady
    }

    func load(document: LocalPDFDocument) {
        currentSourcePath = document.filePath
        currentFileName = document.fileName
        setupErrorMessage = nil
        refreshAvailability()
        refreshRecentRuns()

        if let run = recentRuns.first(where: { $0.sourcePath == document.filePath }) {
            display(run: run)
            return
        }

        latestRun = nil
        outputText = ""
        structuredOutputText = ""
        structuredOutput = nil
        selectedStructuredBlockID = nil
        progress = 0
        completedPageCount = 0
        totalPageCount = document.totalPages
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
            structuredOutputPath: nil,
            errorMessage: nil,
            pageCount: 0,
            completedPageCount: 0,
            totalPageCount: document.totalPages,
            startedAt: Date(),
            completedAt: nil,
            progress: 0,
            statusMessage: "Starting \(provider.descriptor.name)…",
            updatedAt: Date(),
            resumeCount: 0,
            eventSequence: 0
        )

        do {
            try FileManager.default.createDirectory(at: runDirectory, withIntermediateDirectories: true)
            try recordTransition(&run, type: "run.started", in: runDirectory)
        } catch {
            statusMessage = "Could not start extraction: \(error.localizedDescription)"
            return
        }

        beginProcessing(run: run, document: document, provider: provider, in: runDirectory)
    }

    func cancelRun() {
        guard isRunning, var run = activeRun, run.status == "running" else { return }
        let runDirectory = LocalProviderPaths.runDirectory(runsRoot: runsRoot, runID: run.id)
        run.status = "canceling"
        run.cancelRequestedAt = Date()
        run.statusMessage = "Canceling after the current operation…"

        do {
            try recordTransition(&run, type: "run.cancel_requested", in: runDirectory)
        } catch {
            statusMessage = "Could not save the cancellation request: \(error.localizedDescription)"
            return
        }

        activeRun = run
        upsertRecentRun(run)
        if latestRun?.id == run.id {
            latestRun = run
            statusMessage = run.statusMessage ?? "Canceling…"
        }
        processingTask?.cancel()
    }

    func resume(document: LocalPDFDocument) {
        guard canResumeLatestRun,
              var run = latestRun,
              run.sourcePath == document.filePath,
              let providerID = LocalProviderID(rawValue: run.providerId),
              let provider = provider(for: providerID) else {
            return
        }

        selectedProviderID = providerID
        let runDirectory = LocalProviderPaths.runDirectory(runsRoot: runsRoot, runID: run.id)
        let completed = run.completedPageCount ?? 0
        let total = run.totalPageCount ?? document.totalPages
        run.status = "running"
        run.errorMessage = nil
        run.completedAt = nil
        run.cancelRequestedAt = nil
        run.resumeCount = (run.resumeCount ?? 0) + 1
        run.progress = total > 0 ? Double(completed) / Double(total) : 0
        run.statusMessage = completed > 0
            ? "Resuming after \(completed) of \(total) saved pages…"
            : "Restarting \(provider.descriptor.name)…"

        do {
            try recordTransition(&run, type: "run.resumed", in: runDirectory)
        } catch {
            statusMessage = "Could not resume extraction: \(error.localizedDescription)"
            return
        }

        beginProcessing(run: run, document: document, provider: provider, in: runDirectory)
    }

    private func beginProcessing(
        run: LocalProcessingRun,
        document: LocalPDFDocument,
        provider: any LocalProcessingProvider,
        in runDirectory: URL
    ) {
        let runID = run.id

        currentSourcePath = document.filePath
        currentFileName = document.fileName
        activeRun = run
        latestRun = run
        selectedStructuredBlockID = nil
        upsertRecentRun(run)
        progress = run.progress ?? 0
        completedPageCount = run.completedPageCount ?? 0
        totalPageCount = run.totalPageCount ?? document.totalPages
        isRunning = true
        statusMessage = run.statusMessage ?? "Starting \(provider.descriptor.name)…"
        startHealthMonitor()

        let request = LocalProcessingRequest(
            fileName: document.fileName,
            sourceURL: document.fileURL,
            outputDirectory: runDirectory,
            expectedPageCount: document.totalPages,
            pageProgress: { [weak self] update in
                Task { @MainActor in
                    guard let self,
                          var trackedRun = self.activeRun,
                          trackedRun.id == runID,
                          update.completedPageCount >= self.completedPageCount else {
                        return
                    }
                    self.noteProgressEvent()
                    self.completedPageCount = update.completedPageCount
                    self.totalPageCount = update.totalPageCount
                    self.progress = max(self.progress, update.fraction)
                    self.statusMessage = "Saved page \(update.pageNumber) of \(update.totalPageCount) to disk"

                    trackedRun.pageCount = update.completedPageCount
                    trackedRun.completedPageCount = update.completedPageCount
                    trackedRun.totalPageCount = update.totalPageCount
                    trackedRun.progress = self.progress
                    trackedRun.statusMessage = self.statusMessage
                    try? self.recordTransition(
                        &trackedRun,
                        type: "run.page_checkpoint",
                        in: runDirectory
                    )
                    self.activeRun = trackedRun
                    self.upsertRecentRun(trackedRun)
                    if self.latestRun?.id == runID {
                        self.latestRun = trackedRun
                    }
                }
            }
        )

        processingTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await provider.process(request: request) { [weak self] fraction, message in
                    Task { @MainActor in
                        guard let self,
                              var trackedRun = self.activeRun,
                              trackedRun.id == runID else { return }
                        self.noteProgressEvent()
                        self.progress = max(self.progress, min(max(fraction, 0), 1))
                        self.statusMessage = message
                        trackedRun.progress = self.progress
                        trackedRun.statusMessage = message
                        try? self.recordTransition(
                            &trackedRun,
                            type: "run.progress",
                            in: runDirectory
                        )
                        self.activeRun = trackedRun
                        self.upsertRecentRun(trackedRun)
                        if self.latestRun?.id == runID {
                            self.latestRun = trackedRun
                        }
                    }
                }
                try Task.checkCancellation()
                guard var completedRun = activeRun, completedRun.id == runID else { return }
                completedRun.status = "succeeded"
                completedRun.outputPath = result.outputURL.path
                completedRun.structuredOutputPath = result.structuredOutputURL?.path
                completedRun.pageCount = result.pageCount
                completedRun.completedPageCount = result.pageCount
                completedRun.totalPageCount = max(document.totalPages, result.pageCount)
                completedRun.progress = 1
                completedRun.completedAt = Date()
                completedRun.statusMessage = provider.availability().isSimulated
                    ? "Simulation complete · model weights were not loaded."
                    : "Parsed locally with \(provider.descriptor.name)."
                try recordTransition(&completedRun, type: "run.succeeded", in: runDirectory)
                activeRun = completedRun
                upsertRecentRun(completedRun)

                if currentSourcePath == document.filePath {
                    latestRun = completedRun
                    progress = 1
                    completedPageCount = result.pageCount
                    totalPageCount = max(document.totalPages, result.pageCount)
                    statusMessage = completedRun.statusMessage ?? "Extraction complete."
                    loadOutputs()
                }
            } catch is CancellationError {
                if var canceledRun = activeRun, canceledRun.id == runID {
                    let completed = canceledRun.completedPageCount ?? 0
                    let total = canceledRun.totalPageCount ?? document.totalPages
                    canceledRun.status = "canceled"
                    canceledRun.errorMessage = nil
                    canceledRun.completedAt = Date()
                    canceledRun.progress = total > 0 ? Double(completed) / Double(total) : 0
                    canceledRun.statusMessage = "Canceled · \(completed) of \(total) pages saved."
                    try? recordTransition(&canceledRun, type: "run.canceled", in: runDirectory)
                    activeRun = canceledRun
                    upsertRecentRun(canceledRun)
                    if currentSourcePath == document.filePath {
                        latestRun = canceledRun
                        progress = canceledRun.progress ?? 0
                        completedPageCount = completed
                        totalPageCount = total
                        statusMessage = canceledRun.statusMessage ?? "Canceled."
                    }
                }
            } catch {
                if var failedRun = activeRun, failedRun.id == runID {
                    failedRun.status = "failed"
                    failedRun.errorMessage = error.localizedDescription
                    failedRun.completedAt = Date()
                    failedRun.statusMessage = error.localizedDescription
                    try? recordTransition(&failedRun, type: "run.failed", in: runDirectory)
                    activeRun = failedRun
                    upsertRecentRun(failedRun)
                    if currentSourcePath == document.filePath {
                        latestRun = failedRun
                        statusMessage = error.localizedDescription
                    }
                }
            }
            activeRun = nil
            isRunning = false
            processingTask = nil
            stopHealthMonitor()
        }
    }

    private func noteProgressEvent() {
        lastProgressEventAt = Date()
        runHealthMessage = nil
    }

    private func startHealthMonitor() {
        healthMonitorTask?.cancel()
        lastProgressEventAt = Date()
        runHealthMessage = nil
        healthMonitorTask = Task { [weak self] in
            while Task.isCancelled == false {
                try? await Task.sleep(for: .seconds(self?.healthPollInterval ?? 5))
                guard let self, Task.isCancelled == false, self.isRunning else { return }
                guard self.activeRun?.status == "running" else { continue }
                self.runHealthMessage = LocalRunHealth.message(
                    idleFor: Date().timeIntervalSince(self.lastProgressEventAt),
                    stallThreshold: self.stallThreshold,
                    memory: self.memorySampler()
                )
            }
        }
    }

    private func stopHealthMonitor() {
        healthMonitorTask?.cancel()
        healthMonitorTask = nil
        runHealthMessage = nil
    }

    func revealRunsFolder() {
        try? FileManager.default.createDirectory(at: runsRoot, withIntermediateDirectories: true)
        NSWorkspace.shared.open(runsRoot)
    }

    func selectRun(_ run: LocalProcessingRun) {
        currentSourcePath = run.sourcePath
        currentFileName = run.fileName
        display(run: run)
    }

    func selectStructuredBlock(_ id: String) {
        guard pdfBoundingBoxOverlays.contains(where: { $0.id == id }) else { return }
        showsPDFBoundingBoxes = true
        selectedStructuredBlockID = id
    }

    private func display(run: LocalProcessingRun) {
        latestRun = run
        selectedStructuredBlockID = nil
        completedPageCount = run.completedPageCount
            ?? (run.status == "succeeded" ? run.pageCount : 0)
        totalPageCount = run.totalPageCount ?? run.pageCount
        progress = run.progress ?? (totalPageCount > 0
            ? Double(completedPageCount) / Double(totalPageCount)
            : (run.status == "succeeded" ? 1 : 0))
        statusMessage = displayMessage(for: run)
        loadOutputs()
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

    func revealStructuredOutput() {
        guard let structuredOutputURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([structuredOutputURL])
    }

    func copyOutput() {
        guard !outputText.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(outputText, forType: .string)
        statusMessage = "Copied Markdown."
    }

    func copyStructuredOutput() {
        guard !structuredOutputText.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(structuredOutputText, forType: .string)
        statusMessage = "Copied structured JSON."
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

    func saveStructuredOutputAs() {
        guard !structuredOutputText.isEmpty else { return }

        let panel = NSSavePanel()
        panel.title = "Save Structured Extraction"
        panel.prompt = "Save"
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: currentFileName).deletingPathExtension().lastPathComponent).json"

        NSApplication.shared.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let destination = panel.url else { return }

        do {
            try structuredOutputText.write(to: destination, atomically: true, encoding: .utf8)
            statusMessage = "Saved structured JSON."
        } catch {
            statusMessage = "Could not save structured JSON: \(error.localizedDescription)"
        }
    }

    private func provider(for id: LocalProviderID) -> (any LocalProcessingProvider)? {
        providers.first { $0.descriptor.id == id }
    }

    private func recoverOrphanedRuns() {
        for index in recentRuns.indices where ["running", "canceling"].contains(recentRuns[index].status) {
            var run = recentRuns[index]
            let completed = run.completedPageCount ?? 0
            let total = run.totalPageCount ?? run.pageCount
            run.status = "interrupted"
            run.errorMessage = nil
            run.statusMessage = "Run interrupted when okraPDF closed · \(completed) of \(total) pages saved."
            run.progress = total > 0 ? Double(completed) / Double(total) : 0
            let runDirectory = LocalProviderPaths.runDirectory(runsRoot: runsRoot, runID: run.id)
            try? recordTransition(&run, type: "run.interrupted", in: runDirectory)
            recentRuns[index] = run
        }
    }

    private func displayMessage(for run: LocalProcessingRun) -> String {
        if let message = run.statusMessage, message.isEmpty == false {
            return message
        }
        switch run.status {
        case "succeeded":
            return "Parsed locally with \(run.providerName)."
        case "canceled":
            return "Canceled. Resume to keep the saved page checkpoints."
        case "interrupted":
            return "Run interrupted. Resume to keep the saved page checkpoints."
        case "failed":
            return run.errorMessage ?? "This run failed."
        case "canceling":
            return "Canceling after the current operation…"
        case "running":
            return "Extraction is running."
        default:
            return run.errorMessage ?? "This run did not finish."
        }
    }

    private func upsertRecentRun(_ run: LocalProcessingRun) {
        if let index = recentRuns.firstIndex(where: { $0.id == run.id }) {
            recentRuns[index] = run
        } else {
            recentRuns.append(run)
        }
        recentRuns = Array(recentRuns.sorted { $0.startedAt > $1.startedAt }.prefix(12))
    }

    private func recordTransition(
        _ run: inout LocalProcessingRun,
        type: String,
        in runDirectory: URL
    ) throws {
        let timestamp = Date()
        run.updatedAt = timestamp
        run.progress = min(max(run.progress ?? 0, 0), 1)
        run.eventSequence = (run.eventSequence ?? 0) + 1
        try persistSnapshot(run, in: runDirectory)
        try? appendEvent(
            LocalProcessingRunEvent(
                sequence: run.eventSequence ?? 1,
                type: type,
                runId: run.id,
                status: run.status,
                progress: run.progress ?? 0,
                completedPageCount: run.completedPageCount ?? 0,
                totalPageCount: run.totalPageCount ?? run.pageCount,
                message: run.statusMessage ?? run.errorMessage ?? "",
                createdAt: timestamp
            ),
            in: runDirectory
        )
    }

    private func persistSnapshot(_ run: LocalProcessingRun, in runDirectory: URL) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(run)
        try data.write(to: runDirectory.appendingPathComponent("run.json"), options: .atomic)
    }

    private func appendEvent(_ event: LocalProcessingRunEvent, in runDirectory: URL) throws {
        let eventURL = runDirectory.appendingPathComponent("events.jsonl")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        var data = try encoder.encode(event)
        data.append(0x0A)

        if FileManager.default.fileExists(atPath: eventURL.path) == false {
            FileManager.default.createFile(atPath: eventURL.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: eventURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }

    private func loadOutputs() {
        guard let outputURL else {
            outputText = ""
            structuredOutputText = ""
            structuredOutput = nil
            selectedStructuredBlockID = nil
            return
        }
        outputText = (try? String(contentsOf: outputURL, encoding: .utf8)) ?? ""

        guard let structuredOutputURL else {
            structuredOutputText = ""
            structuredOutput = nil
            selectedStructuredBlockID = nil
            return
        }
        structuredOutputText = (try? String(contentsOf: structuredOutputURL, encoding: .utf8)) ?? ""
        structuredOutput = try? StructuredExtractionDocument.load(from: structuredOutputURL)
        if let selectedStructuredBlockID,
           pdfBoundingBoxOverlays.contains(where: { $0.id == selectedStructuredBlockID }) == false {
            self.selectedStructuredBlockID = nil
        }
    }
}
