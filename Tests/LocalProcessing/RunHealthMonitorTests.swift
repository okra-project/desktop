import Foundation
import Testing
@testable import Okra

@MainActor
struct RunHealthMonitorTests {
    private static let oneGiB: UInt64 = 1 << 30

    private func makeDocument(in workspace: TestWorkspace) throws -> LocalPDFDocument {
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let sourceURL = workspace.root.appendingPathComponent("slow.pdf")
        try Data("pdf".utf8).write(to: sourceURL)
        return LocalPDFDocument(
            id: sourceURL.path,
            fileName: sourceURL.lastPathComponent,
            filePath: sourceURL.path,
            totalPages: 2
        )
    }

    @Test("Stalled low-memory run surfaces a truthful health warning", .timeLimit(.minutes(1)))
    func stalledLowMemoryRunSurfacesWarning() async throws {
        let workspace = try TestWorkspace(prefix: "okra-run-health")
        let coordinator = LocalProcessingCoordinator(
            providers: [
                IncrementalFixtureProcessingProvider(
                    pageCount: 2,
                    pauseAfterFirstPage: .seconds(2)
                ),
            ],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults,
            memorySampler: {
                SystemMemoryStatus(
                    freeBytes: 300 * 1_000_000,
                    swapUsedBytes: 11 * Self.oneGiB,
                    swapTotalBytes: 12 * Self.oneGiB
                )
            },
            stallThreshold: 0.3,
            healthPollInterval: 0.05
        )
        let document = try makeDocument(in: workspace)

        coordinator.load(document: document)
        coordinator.run(document: document)

        try await waitUntil("run health warning to appear") {
            guard let message = coordinator.runHealthMessage else { return false }
            return message.contains("Low on memory") && message.contains("no progress")
        }
        #expect(coordinator.isRunning)

        try await waitUntil("fixture parsing to finish") { coordinator.isRunning == false }
        #expect(coordinator.runHealthMessage == nil)
        #expect(coordinator.latestRun?.status == "succeeded")
    }

    @Test("Stalled run with healthy memory reports the stall only", .timeLimit(.minutes(1)))
    func stalledHealthyRunReportsStallOnly() async throws {
        let workspace = try TestWorkspace(prefix: "okra-run-stall")
        let coordinator = LocalProcessingCoordinator(
            providers: [
                IncrementalFixtureProcessingProvider(
                    pageCount: 2,
                    pauseAfterFirstPage: .seconds(2)
                ),
            ],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults,
            memorySampler: {
                SystemMemoryStatus(
                    freeBytes: 8 * Self.oneGiB,
                    swapUsedBytes: 0,
                    swapTotalBytes: 4 * Self.oneGiB
                )
            },
            stallThreshold: 0.3,
            healthPollInterval: 0.05
        )
        let document = try makeDocument(in: workspace)

        coordinator.load(document: document)
        coordinator.run(document: document)

        try await waitUntil("stall warning to appear") {
            coordinator.runHealthMessage?.contains("Taking longer than expected") == true
        }
        #expect(coordinator.runHealthMessage?.contains("Low on memory") == false)

        try await waitUntil("fixture parsing to finish") { coordinator.isRunning == false }
        #expect(coordinator.runHealthMessage == nil)
    }

    @Test("Continuously progressing run stays silent", .timeLimit(.minutes(1)))
    func progressingRunStaysSilent() async throws {
        let workspace = try TestWorkspace(prefix: "okra-run-healthy")
        let coordinator = LocalProcessingCoordinator(
            providers: [IncrementalFixtureProcessingProvider(pageCount: 6)],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults,
            stallThreshold: 60,
            healthPollInterval: 0.05
        )
        let document = try makeDocument(in: workspace)

        coordinator.load(document: document)
        coordinator.run(document: document)

        try await waitUntil("fixture parsing to finish") { coordinator.isRunning == false }
        #expect(coordinator.runHealthMessage == nil)
        #expect(coordinator.latestRun?.status == "succeeded")
    }
}
