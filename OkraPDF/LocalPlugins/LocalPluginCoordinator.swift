import AppKit
import Foundation

@MainActor
final class LocalPluginCoordinator: ObservableObject {
    @Published private(set) var availabilityByPlugin: [LocalPluginID: LocalPluginAvailability] = [:]
    @Published private(set) var activePluginID: LocalPluginID?
    @Published private(set) var setupProgress: LocalPluginSetupProgress?
    @Published private(set) var statusMessage = "Local plugins run after extraction."
    @Published private(set) var errorMessage: String?
    @Published private(set) var isInstalling = false
    @Published private(set) var isRunning = false
    @Published private(set) var latestDetection: PresidioDetectionResult?
    @Published private(set) var latestResultURL: URL?

    let registry: LocalPluginRegistry

    private var installationTask: Task<Void, Never>?
    private var invocationTask: Task<Void, Never>?

    init(registry: LocalPluginRegistry = .standard) {
        self.registry = registry
        refreshAvailability()
    }

    var definitions: [LocalPluginDefinition] {
        registry.definitions
    }

    func availability(for id: LocalPluginID) -> LocalPluginAvailability {
        availabilityByPlugin[id] ?? .unavailable("Unavailable")
    }

    func refreshAvailability() {
        availabilityByPlugin = Dictionary(
            uniqueKeysWithValues: registry.definitions.map { definition in
                let availability = registry.runtime(for: definition.id)?.availability()
                    ?? .unavailable("Unavailable")
                return (definition.id, availability)
            }
        )
    }

    func canInvoke(_ id: LocalPluginID, on run: LocalProcessingRun?) -> Bool {
        guard !isInstalling,
              !isRunning,
              availability(for: id).isReady,
              let run,
              run.status == "succeeded",
              let outputPath = run.outputPath else {
            return false
        }
        return FileManager.default.fileExists(atPath: outputPath)
    }

    func install(_ id: LocalPluginID) {
        guard !isInstalling,
              !isRunning,
              let runtime = registry.runtime(for: id) else {
            return
        }
        activePluginID = id
        isInstalling = true
        setupProgress = LocalPluginSetupProgress(
            fraction: nil,
            message: "Preparing \(runtime.definition.name)…"
        )
        statusMessage = "Setting up \(runtime.definition.name)…"
        errorMessage = nil

        installationTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await runtime.install { [weak self] progress in
                    Task { @MainActor in
                        guard let self, self.isInstalling, self.activePluginID == id else { return }
                        self.setupProgress = progress
                        self.statusMessage = progress.message
                    }
                }
                self.refreshAvailability()
                self.setupProgress = LocalPluginSetupProgress(
                    fraction: 1,
                    message: "\(runtime.definition.name) is ready offline."
                )
                self.statusMessage = "\(runtime.definition.name) is ready offline."
            } catch is CancellationError {
                self.setupProgress = nil
                self.statusMessage = "Plugin setup canceled. You can resume when you are ready."
            } catch {
                self.setupProgress = nil
                self.errorMessage = error.localizedDescription
                self.statusMessage = error.localizedDescription
            }
            self.isInstalling = false
            self.activePluginID = nil
            self.installationTask = nil
        }
    }

    func cancelInstallation() {
        guard isInstalling else { return }
        statusMessage = "Canceling plugin setup…"
        installationTask?.cancel()
    }

    func invoke(_ id: LocalPluginID, on run: LocalProcessingRun) {
        guard canInvoke(id, on: run),
              let runtime = registry.runtime(for: id),
              let outputPath = run.outputPath else {
            return
        }

        let runDirectory = URL(fileURLWithPath: outputPath).deletingLastPathComponent()
        let pluginOutputDirectory = LocalPluginPaths.pluginOutputDirectory(
            for: runDirectory,
            pluginID: id
        )
        let invocation = LocalPluginInvocation(
            runID: run.id,
            sourceOutputURL: URL(fileURLWithPath: outputPath),
            structuredOutputURL: run.structuredOutputPath.map { URL(fileURLWithPath: $0) },
            outputDirectory: pluginOutputDirectory
        )

        activePluginID = id
        isRunning = true
        latestDetection = nil
        latestResultURL = nil
        errorMessage = nil
        statusMessage = "Starting \(runtime.definition.name)…"

        invocationTask = Task { [weak self] in
            guard let self else { return }
            do {
                let resultURL = try await runtime.invoke(invocation: invocation) { [weak self] _, message in
                    Task { @MainActor in
                        guard let self, self.isRunning, self.activePluginID == id else { return }
                        self.statusMessage = message
                    }
                }
                try Task.checkCancellation()
                let detection = try PresidioDetectionResult.load(from: resultURL)
                self.latestDetection = detection
                self.latestResultURL = resultURL
                self.statusMessage = detection.stats.total == 1
                    ? "Detected 1 PII candidate. Review it before redacting."
                    : "Detected \(detection.stats.total) PII candidates. Review them before redacting."
            } catch is CancellationError {
                self.statusMessage = "PII detection canceled."
            } catch {
                self.errorMessage = error.localizedDescription
                self.statusMessage = error.localizedDescription
            }
            self.isRunning = false
            self.activePluginID = nil
            self.invocationTask = nil
        }
    }

    func cancelInvocation() {
        guard isRunning else { return }
        statusMessage = "Canceling PII detection…"
        invocationTask?.cancel()
    }

    func load(run: LocalProcessingRun?) {
        guard !isRunning, !isInstalling else { return }
        errorMessage = nil
        guard let run,
              let outputPath = run.outputPath else {
            latestDetection = nil
            latestResultURL = nil
            statusMessage = "Local plugins run after extraction."
            return
        }
        let runDirectory = URL(fileURLWithPath: outputPath).deletingLastPathComponent()
        let resultURL = LocalPluginPaths.pluginOutputDirectory(
            for: runDirectory,
            pluginID: .presidioNER
        ).appendingPathComponent("result.json")
        guard FileManager.default.fileExists(atPath: resultURL.path),
              let detection = try? PresidioDetectionResult.load(from: resultURL) else {
            latestDetection = nil
            latestResultURL = nil
            statusMessage = "Local plugins run after extraction."
            return
        }
        latestDetection = detection
        latestResultURL = resultURL
        statusMessage = "Loaded \(detection.stats.total) saved PII candidates."
    }

    func copyResult() {
        guard let latestResultURL,
              let text = try? String(contentsOf: latestResultURL, encoding: .utf8) else {
            return
        }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        statusMessage = "Copied PII detection JSON."
    }

    func revealResult() {
        guard let latestResultURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([latestResultURL])
    }
}
