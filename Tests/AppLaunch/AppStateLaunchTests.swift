import Foundation
import Testing
@testable import Okra

@MainActor
struct AppStateLaunchTests {
    @Test("Default startup constructs every bundled provider")
    func defaultStartupConstructsBundledProviders() throws {
        let workspace = try TestWorkspace(prefix: "okra-default-launch")

        let coordinator = LocalProcessingCoordinator(
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let state = AppState(localProcessing: coordinator)

        #expect(
            coordinator.descriptors.map(\.id)
                == [.appleVision, .docling, .unlimitedOCR]
        )
        #expect(coordinator.selectedProviderID == .appleVision)
        #expect(state.selectedDocument == nil)
    }

    @Test("Invalid stored provider falls back without terminating startup")
    func invalidStoredProviderFallsBack() throws {
        let workspace = try TestWorkspace(prefix: "okra-invalid-provider")
        workspace.defaults.set("removed-provider", forKey: "localProcessing.selectedProvider")

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )

        #expect(coordinator.selectedProviderID == .appleVision)
        #expect(coordinator.selectedAvailability == .ready)
    }

    @Test("Corrupt run manifests are skipped during startup")
    func corruptRunManifestsAreSkipped() throws {
        let workspace = try TestWorkspace(prefix: "okra-corrupt-history")
        let corruptRunDirectory = workspace.runsRoot
            .appendingPathComponent("corrupt-run", isDirectory: true)
        try FileManager.default.createDirectory(
            at: corruptRunDirectory,
            withIntermediateDirectories: true
        )
        try Data("not-json".utf8).write(
            to: corruptRunDirectory.appendingPathComponent("run.json")
        )

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )

        #expect(coordinator.recentRuns.isEmpty)
        #expect(coordinator.selectedAvailability == .ready)
    }
}
