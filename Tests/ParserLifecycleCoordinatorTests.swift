import Foundation
import Testing
@testable import Okra

@MainActor
@Suite("Durable parser lifecycle coordination")
struct ParserLifecycleCoordinatorTests {
    @Test("A run persists idle, in-progress, and done page states", .timeLimit(.minutes(1)))
    func persistsLifecycleProgress() async throws {
        let workspace = try TestWorkspace(prefix: "okra-parser-lifecycle")
        let document = try makeDocument(in: workspace)
        let coordinator = LocalProcessingCoordinator(
            providers: [LifecycleFixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        coordinator.load(document: document)

        #expect(coordinator.pageLifecycles.map(\.state) == [.idle])
        coordinator.run(document: document)
        try await waitUntil("page lifecycle to become active") {
            coordinator.pageLifecycles.first?.state == .inProgress
        }

        let activeRun = try #require(coordinator.latestRun)
        let activeSnapshot = try loadRun(activeRun.id, from: workspace)
        #expect(activeSnapshot.pageLifecycles?.first?.state == .inProgress)

        try await waitUntil("page lifecycle to finish") { coordinator.isRunning == false }
        #expect(coordinator.pageLifecycles.map(\.state) == [.done])
        let completedSnapshot = try loadRun(activeRun.id, from: workspace)
        #expect(completedSnapshot.pageLifecycles?.first?.state == .done)
    }

    @Test("Cancellation durably moves the active page to attention", .timeLimit(.minutes(1)))
    func cancellationNeedsAttention() async throws {
        let workspace = try TestWorkspace(prefix: "okra-parser-attention")
        let document = try makeDocument(in: workspace)
        let coordinator = LocalProcessingCoordinator(
            providers: [LifecycleFixtureProcessingProvider(pauseDuringPage: .seconds(2))],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        coordinator.load(document: document)
        coordinator.run(document: document)
        try await waitUntil("page lifecycle to become active") {
            coordinator.pageLifecycles.first?.state == .inProgress
        }

        coordinator.cancelRun()
        try await waitUntil("run cancellation") { coordinator.isRunning == false }

        let run = try #require(coordinator.latestRun)
        #expect(run.status == "canceled")
        #expect(coordinator.pageLifecycles.first?.state == .attention)
        #expect(try loadRun(run.id, from: workspace).pageLifecycles?.first?.state == .attention)
    }

    @Test("Parser failure durably marks the active page as error", .timeLimit(.minutes(1)))
    func failureMarksError() async throws {
        let workspace = try TestWorkspace(prefix: "okra-parser-error")
        let document = try makeDocument(in: workspace)
        let coordinator = LocalProcessingCoordinator(
            providers: [
                LifecycleFixtureProcessingProvider(
                    pauseDuringPage: .milliseconds(10),
                    failure: LocalProcessingError.invalidPDF
                )
            ],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        coordinator.load(document: document)
        coordinator.run(document: document)
        try await waitUntil("run failure") { coordinator.isRunning == false }

        let run = try #require(coordinator.latestRun)
        #expect(run.status == "failed")
        #expect(coordinator.pageLifecycles.first?.state == .error)
        #expect(try loadRun(run.id, from: workspace).pageLifecycles?.first?.state == .error)
    }

    @Test("A second parser keeps its page state when its local count is lower", .timeLimit(.minutes(1)))
    func preservesSecondParserProgress() async throws {
        let workspace = try TestWorkspace(prefix: "okra-multi-parser-lifecycle")
        let document = try makeDocument(in: workspace)
        let coordinator = LocalProcessingCoordinator(
            providers: [MultiParserLifecycleFixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        coordinator.load(document: document)
        coordinator.run(document: document)

        try await waitUntil(
            "second parser lifecycle to become active",
            timeout: .milliseconds(300)
        ) {
            coordinator.pageLifecycles.contains {
                $0.parserID == LocalProviderID.unlimitedOCR.rawValue
                    && $0.state == .inProgress
            }
        }

        #expect(coordinator.completedPageCount == 1)
        #expect(coordinator.pageLifecycleGroups.count == 2)
        coordinator.cancelRun()
        try await waitUntil("multi-parser run cancellation") { coordinator.isRunning == false }
    }

    private func makeDocument(in workspace: TestWorkspace) throws -> LocalPDFDocument {
        let sourceURL = workspace.root.appendingPathComponent("lifecycle.pdf")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        try Data("pdf".utf8).write(to: sourceURL)
        return LocalPDFDocument(
            id: sourceURL.path,
            fileName: sourceURL.lastPathComponent,
            filePath: sourceURL.path,
            totalPages: 1
        )
    }

    private func loadRun(_ runID: String, from workspace: TestWorkspace) throws -> LocalProcessingRun {
        let data = try Data(
            contentsOf: workspace.runsRoot
                .appendingPathComponent(runID, isDirectory: true)
                .appendingPathComponent("run.json")
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(LocalProcessingRun.self, from: data)
    }
}
