import AppKit
import PDFKit
import XCTest
@testable import Okra

final class LocalProcessingProviderTests: XCTestCase {
    func testAppleVisionIsReadyWithoutSetup() {
        let provider = AppleVisionProcessingProvider()
        XCTAssertEqual(provider.descriptor.id, .appleVision)
        XCTAssertEqual(provider.availability(), .ready)
    }

    func testUnlimitedOCRSimulationIsClearlyReportedAsSimulation() {
        let provider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )

        XCTAssertEqual(provider.descriptor.name, "Baidu Unlimited-OCR")
        XCTAssertEqual(provider.availability(), .simulated("Simulation ready"))
    }

    @MainActor
    func testSimulationModeSelectsBaiduProvider() {
        let simulatedProvider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )
        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider(), simulatedProvider]
        )

        XCTAssertEqual(coordinator.selectedProviderID, .unlimitedOCR)
        XCTAssertEqual(coordinator.selectedAvailability, .simulated("Simulation ready"))
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
        XCTAssertEqual(persisted.executionMode, "local")
        XCTAssertEqual(persisted.status, "succeeded")
        XCTAssertEqual(persisted.outputPath, run.outputPath)
        XCTAssertNotNil(persisted.completedAt)
        XCTAssertTrue(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("result.md").path))
    }

    @MainActor
    func testOpeningPDFDoesNotStartExtraction() throws {
        let root = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-open-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let pdfURL = root.appendingPathComponent("read-first.pdf")
        try makePDF(pageTexts: ["Read before parsing"]).write(to: pdfURL)

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: root.appendingPathComponent("runs", isDirectory: true)
        )
        let state = AppState(localProcessing: coordinator)

        state.openPDF(pdfURL)

        XCTAssertEqual(state.selectedDocument?.fileName, "read-first.pdf")
        XCTAssertEqual(state.selectedDocument?.totalPages, 1)
        XCTAssertNil(coordinator.latestRun)
        XCTAssertFalse(coordinator.isRunning)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("runs").path))
    }

    @MainActor
    func testExplicitParseActionStartsSelectedDocument() async throws {
        let root = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-explicit-parse-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let pdfURL = root.appendingPathComponent("explicit.pdf")
        try makePDF(pageTexts: ["Parse after click"]).write(to: pdfURL)
        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: root.appendingPathComponent("runs", isDirectory: true)
        )
        let state = AppState(localProcessing: coordinator)
        state.openPDF(pdfURL)

        state.parseSelectedDocument()
        while coordinator.isRunning {
            try await Task.sleep(nanoseconds: 10_000_000)
        }

        XCTAssertEqual(coordinator.latestRun?.status, "succeeded")
        XCTAssertEqual(coordinator.outputText, "# Parsed\n")
    }

    @MainActor
    func testBaiduUnlimitedOCREndToEndSimulationOnPDF() async throws {
        let root = TestPaths.temporaryDirectory
            .appendingPathComponent("okra-baidu-e2e-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let pdfURL: URL
        let expectedPageCount: Int
        if let suppliedPath = ProcessInfo.processInfo.environment["OKRA_DESKTOP_E2E_PDF"] {
            pdfURL = URL(fileURLWithPath: suppliedPath).standardizedFileURL
            let suppliedPDF = try XCTUnwrap(PDFDocument(url: pdfURL))
            expectedPageCount = suppliedPDF.pageCount
            XCTAssertGreaterThan(expectedPageCount, 0)
        } else {
            pdfURL = root.appendingPathComponent("two-page-scan.pdf")
            try makePDF(pageTexts: ["Invoice 1042", "Total due 49.00"]).write(to: pdfURL)
            expectedPageCount = 2
        }

        let provider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )
        let runsRoot = root.appendingPathComponent("runs", isDirectory: true)
        let coordinator = LocalProcessingCoordinator(
            providers: [provider],
            runsRoot: runsRoot
        )
        let document = LocalPDFDocument(
            id: pdfURL.path,
            fileName: pdfURL.lastPathComponent,
            filePath: pdfURL.path,
            totalPages: expectedPageCount
        )

        coordinator.load(document: document)
        XCTAssertEqual(coordinator.selectedAvailability, .simulated("Simulation ready"))
        coordinator.run(document: document)

        while coordinator.isRunning {
            try await Task.sleep(nanoseconds: 10_000_000)
        }

        let run = try XCTUnwrap(coordinator.latestRun)
        XCTAssertEqual(run.status, "succeeded")
        XCTAssertEqual(run.providerId, "unlimited-ocr")
        XCTAssertEqual(run.providerName, "Baidu Unlimited-OCR")
        XCTAssertEqual(run.executionMode, "simulation")
        XCTAssertEqual(run.pageCount, expectedPageCount)
        XCTAssertEqual(coordinator.progress, 1)
        XCTAssertEqual(coordinator.statusMessage, "Simulation complete · model weights were not loaded.")
        XCTAssertTrue(coordinator.outputText.contains("Simulation: Baidu Unlimited-OCR model weights were not loaded."))
        XCTAssertTrue(coordinator.outputText.contains("HF_HUB_OFFLINE=1"))
        XCTAssertTrue(coordinator.outputText.contains("TRANSFORMERS_OFFLINE=1"))
        XCTAssertTrue(coordinator.outputText.contains("HF_DATASETS_OFFLINE=1"))
        XCTAssertTrue(coordinator.outputText.contains("## Page 1"))
        XCTAssertTrue(coordinator.outputText.contains("## Page \(expectedPageCount)"))

        let runDirectory = runsRoot.appendingPathComponent(run.id, isDirectory: true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("run.json").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("result.md").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("pages/page-0001.png").path))
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: runDirectory
                    .appendingPathComponent(String(format: "pages/page-%04d.png", expectedPageCount))
                    .path
            )
        )

        let manifestData = try Data(contentsOf: runDirectory.appendingPathComponent("run.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let persisted = try decoder.decode(LocalProcessingRun.self, from: manifestData)
        XCTAssertEqual(persisted.executionMode, "simulation")
        XCTAssertEqual(persisted.status, "succeeded")
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

    private func makePDF(pageTexts: [String]) throws -> Data {
        let document = PDFDocument()

        for (index, text) in pageTexts.enumerated() {
            let pageView = NSView(frame: NSRect(x: 0, y: 0, width: 612, height: 792))
            let label = NSTextField(labelWithString: text)
            label.font = .systemFont(ofSize: 30)
            label.frame = NSRect(x: 72, y: 640, width: 468, height: 60)
            pageView.addSubview(label)
            let pageData = pageView.dataWithPDF(inside: pageView.bounds)
            let pageDocument = try XCTUnwrap(PDFDocument(data: pageData))
            let page = try XCTUnwrap(pageDocument.page(at: 0))
            document.insert(page, at: index)
        }

        return try XCTUnwrap(document.dataRepresentation())
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
