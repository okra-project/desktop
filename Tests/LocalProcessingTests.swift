import AppKit
import XCTest
@testable import Okra

final class LocalProcessingProviderTests: XCTestCase {
    func testAppleVisionIsReadyWithoutSetup() {
        let provider = AppleVisionProcessingProvider()
        XCTAssertEqual(provider.descriptor.id, .appleVision)
        XCTAssertEqual(provider.availability(), .ready)
    }

    func testRunDirectoryUsesOnlyTheRunIdentifier() {
        let root = URL(fileURLWithPath: "/tmp/okra-runs", isDirectory: true)
        XCTAssertEqual(
            LocalProviderPaths.runDirectory(runsRoot: root, runID: "run-1").path,
            "/tmp/okra-runs/run-1"
        )
    }

    @MainActor
    func testCoordinatorWritesMarkdownAndRunManifest() async throws {
        let root = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-run-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let sourceURL = root.appendingPathComponent("sample.pdf")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("pdf".utf8).write(to: sourceURL)

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: root.appendingPathComponent("runs", isDirectory: true)
        )
        let document = LocalPDFDocument(
            id: sourceURL.path,
            fileName: sourceURL.lastPathComponent,
            filePath: sourceURL.path,
            totalPages: 1
        )

        coordinator.load(document: document)
        coordinator.run(document: document)

        while coordinator.isRunning {
            try await Task.sleep(nanoseconds: 10_000_000)
        }

        let run = try XCTUnwrap(coordinator.latestRun)
        XCTAssertEqual(run.status, "succeeded")
        XCTAssertEqual(run.sourcePath, sourceURL.path)
        XCTAssertEqual(coordinator.outputText, "# Parsed\n")

        let runDirectory = root
            .appendingPathComponent("runs", isDirectory: true)
            .appendingPathComponent(run.id, isDirectory: true)
        let manifestData = try Data(contentsOf: runDirectory.appendingPathComponent("run.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let persisted = try decoder.decode(LocalProcessingRun.self, from: manifestData)
        XCTAssertEqual(persisted.id, run.id)
        XCTAssertEqual(persisted.sourcePath, run.sourcePath)
        XCTAssertEqual(persisted.providerId, run.providerId)
        XCTAssertEqual(persisted.status, "succeeded")
        XCTAssertEqual(persisted.outputPath, run.outputPath)
        XCTAssertNotNil(persisted.completedAt)
        XCTAssertTrue(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("result.md").path))
    }

    @MainActor
    func testAppleVisionWritesMarkdownForSinglePagePDF() async throws {
        let root = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-vision-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let page = NSView(frame: NSRect(x: 0, y: 0, width: 612, height: 792))
        let label = NSTextField(labelWithString: "okraPDF local extraction")
        label.font = .systemFont(ofSize: 32)
        label.frame = NSRect(x: 72, y: 640, width: 468, height: 60)
        page.addSubview(label)
        let pdfData = page.dataWithPDF(inside: page.bounds)
        let pdfURL = root.appendingPathComponent("sample.pdf")
        try pdfData.write(to: pdfURL)

        let result = try await AppleVisionProcessingProvider().process(
            request: LocalProcessingRequest(
                fileName: "sample.pdf",
                sourceURL: pdfURL,
                outputDirectory: root.appendingPathComponent("output", isDirectory: true),
                expectedPageCount: 1
            ),
            progress: { _, _ in }
        )

        let markdown = try String(contentsOf: result.outputURL, encoding: .utf8)
        XCTAssertEqual(result.pageCount, 1)
        XCTAssertTrue(markdown.contains("# sample.pdf"))
        XCTAssertTrue(markdown.contains("## Page 1"))
        XCTAssertTrue(markdown.contains("okraPDF local extraction"))
    }
}

private final class FixtureProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .appleVision,
        name: "Fixture Parser",
        summary: "Test parser",
        setupNote: nil
    )

    func availability() -> LocalProviderAvailability {
        .ready
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        try FileManager.default.createDirectory(at: request.outputDirectory, withIntermediateDirectories: true)
        let outputURL = request.outputDirectory.appendingPathComponent("result.md")
        try "# Parsed\n".write(to: outputURL, atomically: true, encoding: .utf8)
        progress(1, "Complete")
        return LocalProcessingResult(outputURL: outputURL, pageCount: 1)
    }
}
