import Foundation
import Testing
@testable import Okra

@MainActor
struct LocalProviderSetupTests {
    @Test("Setup publishes progress and finishes offline-ready")
    func setupLifecycle() async throws {
        let fixtureRoot = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-setup-\(UUID().uuidString)", isDirectory: true)
        let defaultsName = "okra-setup-defaults-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: defaultsName))
        defer {
            try? FileManager.default.removeItem(at: fixtureRoot)
            defaults.removePersistentDomain(forName: defaultsName)
        }

        let coordinator = LocalProcessingCoordinator(
            providers: [SetupFixtureProvider()],
            runsRoot: fixtureRoot,
            userDefaults: defaults
        )
        coordinator.installSelectedProvider()
        while coordinator.isInstalling {
            await Task.yield()
        }

        #expect(coordinator.selectedAvailability == .ready)
        #expect(coordinator.setupProgress?.phase == .ready)
        #expect(coordinator.setupProgress?.fraction == 1)
        #expect(coordinator.setupErrorMessage == nil)
        #expect(coordinator.statusMessage == "Baidu Unlimited-OCR is ready offline.")
    }

    @Test("Canceled setup remains resumable")
    func canceledSetup() async throws {
        let fixtureRoot = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-cancel-\(UUID().uuidString)", isDirectory: true)
        let defaultsName = "okra-cancel-defaults-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: defaultsName))
        defer {
            try? FileManager.default.removeItem(at: fixtureRoot)
            defaults.removePersistentDomain(forName: defaultsName)
        }

        let coordinator = LocalProcessingCoordinator(
            providers: [SetupFixtureProvider(suspendsDuringDownload: true)],
            runsRoot: fixtureRoot,
            userDefaults: defaults
        )
        coordinator.installSelectedProvider()
        while coordinator.setupProgress?.phase != .downloadingModel {
            await Task.yield()
        }
        coordinator.cancelInstallation()
        while coordinator.isInstalling {
            await Task.yield()
        }

        #expect(coordinator.selectedAvailability.isReady == false)
        #expect(coordinator.setupProgress == nil)
        #expect(coordinator.setupErrorMessage == nil)
        #expect(coordinator.statusMessage == "Setup canceled. You can resume when you are ready.")
    }

    @Test("Recent runs are loaded newest first")
    func recentRuns() throws {
        let fixtureRoot = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-history-\(UUID().uuidString)", isDirectory: true)
        let defaultsName = "okra-history-defaults-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: defaultsName))
        defer {
            try? FileManager.default.removeItem(at: fixtureRoot)
            defaults.removePersistentDomain(forName: defaultsName)
        }
        try FileManager.default.createDirectory(at: fixtureRoot, withIntermediateDirectories: true)

        let older = makeRun(id: "older", startedAt: Date(timeIntervalSince1970: 100))
        let newer = makeRun(id: "newer", startedAt: Date(timeIntervalSince1970: 200))
        try write(older, to: fixtureRoot)
        try write(newer, to: fixtureRoot)

        let coordinator = LocalProcessingCoordinator(
            providers: [SetupFixtureProvider()],
            runsRoot: fixtureRoot,
            userDefaults: defaults
        )

        #expect(coordinator.recentRuns.map(\.id) == ["newer", "older"])
    }

    @Test("Pinned model manifest has a checksum for every byte")
    func modelManifest() {
        #expect(UnlimitedOCRModelManifest.artifacts.count == 8)
        #expect(UnlimitedOCRModelManifest.totalBytes == 2_461_271_624)
        #expect(UnlimitedOCRModelManifest.artifacts.allSatisfy { $0.sha256.count == 64 })
        #expect(Set(UnlimitedOCRModelManifest.artifacts.map(\.path)).count == 8)
    }

    @Test("Setup progress clamps determinate values", arguments: [-1.0, 0.42, 2.0])
    func progressClamping(input: Double) {
        let progress = LocalProviderSetupProgress(
            phase: .downloadingModel,
            fraction: input,
            message: "Downloading"
        )
        #expect(progress.fraction == min(max(input, 0), 1))
    }

    private func makeRun(id: String, startedAt: Date) -> LocalProcessingRun {
        LocalProcessingRun(
            id: id,
            sourcePath: "/tmp/\(id).pdf",
            fileName: "\(id).pdf",
            providerId: "unlimited-ocr",
            providerName: "Baidu Unlimited-OCR",
            executionMode: "local",
            status: "succeeded",
            outputPath: nil,
            errorMessage: nil,
            pageCount: 1,
            startedAt: startedAt,
            completedAt: startedAt
        )
    }

    private func write(_ run: LocalProcessingRun, to root: URL) throws {
        let runDirectory = root.appendingPathComponent(run.id, isDirectory: true)
        try FileManager.default.createDirectory(at: runDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(run).write(to: runDirectory.appendingPathComponent("run.json"))
    }
}
