import AppKit
import Foundation
import PDFKit
import Testing
@testable import Okra

@MainActor
struct LocalProcessingProviderTests {
    @Test("Apple Vision is ready without setup")
    func appleVisionIsReadyWithoutSetup() {
        let provider = AppleVisionProcessingProvider()

        #expect(provider.descriptor.id == .appleVision)
        #expect(provider.availability() == .ready)
    }

    @Test("Unlimited-OCR simulation is clearly reported as simulation")
    func unlimitedOCRSimulationIsClearlyReportedAsSimulation() {
        let provider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )

        #expect(provider.descriptor.name == "Baidu Unlimited-OCR")
        #expect(provider.availability() == .simulated("Simulation ready"))
    }

    @Test("Simulation mode selects the Baidu provider")
    func simulationModeSelectsBaiduProvider() throws {
        let workspace = try TestWorkspace(prefix: "okra-simulation-selection")
        let simulatedProvider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )
        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider(), simulatedProvider],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )

        #expect(coordinator.selectedProviderID == .unlimitedOCR)
        #expect(coordinator.selectedAvailability == .simulated("Simulation ready"))
    }

    @Test("Run directory uses only the run identifier")
    func runDirectoryUsesOnlyTheRunIdentifier() {
        let root = URL(fileURLWithPath: "/tmp/okra-runs", isDirectory: true)

        #expect(
            LocalProviderPaths.runDirectory(runsRoot: root, runID: "run-1").path
                == "/tmp/okra-runs/run-1"
        )
    }

    @Test("Coordinator writes Markdown and its run manifest", .timeLimit(.minutes(1)))
    func coordinatorWritesMarkdownAndRunManifest() async throws {
        let workspace = try TestWorkspace(prefix: "okra-run")
        let sourceURL = workspace.root.appendingPathComponent("sample.pdf")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        try Data("pdf".utf8).write(to: sourceURL)

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let document = LocalPDFDocument(
            id: sourceURL.path,
            fileName: sourceURL.lastPathComponent,
            filePath: sourceURL.path,
            totalPages: 1
        )

        coordinator.load(document: document)
        coordinator.run(document: document)
        try await waitUntil("fixture parsing to finish") { coordinator.isRunning == false }

        let run = try #require(coordinator.latestRun)
        #expect(run.status == "succeeded")
        #expect(run.sourcePath == sourceURL.path)
        #expect(coordinator.outputText == "# Parsed\n")

        let runDirectory = workspace.runsRoot.appendingPathComponent(run.id, isDirectory: true)
        let manifestData = try Data(contentsOf: runDirectory.appendingPathComponent("run.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let persisted = try decoder.decode(LocalProcessingRun.self, from: manifestData)

        #expect(persisted.id == run.id)
        #expect(persisted.sourcePath == run.sourcePath)
        #expect(persisted.providerId == run.providerId)
        #expect(persisted.executionMode == "local")
        #expect(persisted.status == "succeeded")
        #expect(persisted.outputPath == run.outputPath)
        #expect(persisted.completedAt != nil)
        #expect(
            FileManager.default.fileExists(
                atPath: runDirectory.appendingPathComponent("result.md").path
            )
        )
    }

    @Test("Page progress is persisted while extraction is still running", .timeLimit(.minutes(1)))
    func pageProgressPersistsDuringExtraction() async throws {
        let workspace = try TestWorkspace(prefix: "okra-live-page-progress")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let sourceURL = workspace.root.appendingPathComponent("large.pdf")
        try Data("pdf".utf8).write(to: sourceURL)
        let pageCount = 3
        let coordinator = LocalProcessingCoordinator(
            providers: [IncrementalFixtureProcessingProvider(pageCount: pageCount)],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let document = LocalPDFDocument(
            id: sourceURL.path,
            fileName: sourceURL.lastPathComponent,
            filePath: sourceURL.path,
            totalPages: pageCount
        )

        coordinator.run(document: document)
        try await waitUntil("first page checkpoint to be persisted") {
            coordinator.completedPageCount == 1
        }

        let activeRun = try #require(coordinator.latestRun)
        let runDirectory = workspace.runsRoot.appendingPathComponent(
            activeRun.id,
            isDirectory: true
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let persistedDuringRun = try decoder.decode(
            LocalProcessingRun.self,
            from: Data(contentsOf: runDirectory.appendingPathComponent("run.json"))
        )
        #expect(coordinator.isRunning)
        #expect(persistedDuringRun.status == "running")
        #expect(persistedDuringRun.completedPageCount == 1)
        #expect(persistedDuringRun.totalPageCount == pageCount)
        #expect(persistedDuringRun.pageCount == 1)
        #expect(
            FileManager.default.fileExists(
                atPath: runDirectory
                    .appendingPathComponent("page-results/page-0001.md")
                    .path
            )
        )
        #expect(
            FileManager.default.fileExists(
                atPath: runDirectory.appendingPathComponent("result.md").path
            ) == false
        )

        try await waitUntil("incremental extraction to finish") {
            coordinator.isRunning == false
        }
        #expect(coordinator.completedPageCount == pageCount)
        #expect(coordinator.progress == 1)
    }

    @Test("Opening a PDF does not start extraction")
    func openingPDFDoesNotStartExtraction() throws {
        let workspace = try TestWorkspace(prefix: "okra-open")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let pdfURL = workspace.root.appendingPathComponent("read-first.pdf")
        try makePDF(pageTexts: ["Read before parsing"]).write(to: pdfURL)

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let state = AppState(localProcessing: coordinator)

        state.openPDF(pdfURL)

        #expect(state.selectedDocument?.fileName == "read-first.pdf")
        #expect(state.selectedDocument?.totalPages == 1)
        #expect(coordinator.latestRun == nil)
        #expect(coordinator.isRunning == false)
        #expect(FileManager.default.fileExists(atPath: workspace.runsRoot.path) == false)
    }

    @Test("Explicit Parse starts the selected document", .timeLimit(.minutes(1)))
    func explicitParseActionStartsSelectedDocument() async throws {
        let workspace = try TestWorkspace(prefix: "okra-explicit-parse")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let pdfURL = workspace.root.appendingPathComponent("explicit.pdf")
        try makePDF(pageTexts: ["Parse after click"]).write(to: pdfURL)

        let coordinator = LocalProcessingCoordinator(
            providers: [FixtureProcessingProvider()],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let state = AppState(localProcessing: coordinator)
        state.openPDF(pdfURL)

        state.parseSelectedDocument()
        try await waitUntil("explicit parsing to finish") { coordinator.isRunning == false }

        #expect(coordinator.latestRun?.status == "succeeded")
        #expect(coordinator.outputText == "# Parsed\n")
    }

    @Test(
        "Baidu Unlimited-OCR simulation completes the PDF workflow",
        .tags(.smoke),
        .timeLimit(.minutes(1))
    )
    func baiduUnlimitedOCREndToEndSimulationOnPDF() async throws {
        let workspace = try TestWorkspace(prefix: "okra-baidu-e2e")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)

        let pdfURL: URL
        let expectedPageCount: Int
        if let suppliedPath = ProcessInfo.processInfo.environment["OKRA_DESKTOP_E2E_PDF"] {
            pdfURL = URL(fileURLWithPath: suppliedPath).standardizedFileURL
            let suppliedPDF = try #require(PDFDocument(url: pdfURL))
            expectedPageCount = suppliedPDF.pageCount
            try #require(expectedPageCount > 0)
        } else {
            pdfURL = workspace.root.appendingPathComponent("two-page-scan.pdf")
            try makePDF(pageTexts: ["Invoice 1042", "Total due 49.00"]).write(to: pdfURL)
            expectedPageCount = 2
        }

        let provider = UnlimitedOCRProcessingProvider(
            environment: ["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR": "1"]
        )
        let coordinator = LocalProcessingCoordinator(
            providers: [provider],
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )
        let document = LocalPDFDocument(
            id: pdfURL.path,
            fileName: pdfURL.lastPathComponent,
            filePath: pdfURL.path,
            totalPages: expectedPageCount
        )

        coordinator.load(document: document)
        #expect(coordinator.selectedAvailability == .simulated("Simulation ready"))
        coordinator.run(document: document)
        try await waitUntil("simulated Baidu parsing to finish") { coordinator.isRunning == false }

        let run = try #require(coordinator.latestRun)
        #expect(run.status == "succeeded")
        #expect(run.providerId == "unlimited-ocr")
        #expect(run.providerName == "Baidu Unlimited-OCR")
        #expect(run.executionMode == "simulation")
        #expect(run.pageCount == expectedPageCount)
        #expect(coordinator.progress == 1)
        #expect(coordinator.completedPageCount == expectedPageCount)
        #expect(coordinator.totalPageCount == expectedPageCount)
        #expect(coordinator.statusMessage == "Simulation complete · model weights were not loaded.")
        #expect(
            coordinator.outputText.contains(
                "Simulation: Baidu Unlimited-OCR model weights were not loaded."
            )
        )
        #expect(coordinator.outputText.contains("HF_HUB_OFFLINE=1"))
        #expect(coordinator.outputText.contains("TRANSFORMERS_OFFLINE=1"))
        #expect(coordinator.outputText.contains("HF_DATASETS_OFFLINE=1"))
        #expect(coordinator.outputText.contains("## Page 1"))
        #expect(coordinator.outputText.contains("## Page \(expectedPageCount)"))
        #expect(coordinator.structuredOutput?.provider.id == "unlimited-ocr")
        #expect(coordinator.structuredOutput?.pageCount == expectedPageCount)
        #expect(coordinator.structuredOutput?.completedPageCount == expectedPageCount)
        #expect(coordinator.structuredOutput?.complete == true)
        #expect(coordinator.structuredOutput?.simulation == true)

        let runDirectory = workspace.runsRoot.appendingPathComponent(run.id, isDirectory: true)
        #expect(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("run.json").path))
        #expect(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("result.md").path))
        #expect(FileManager.default.fileExists(atPath: runDirectory.appendingPathComponent("result.json").path))
        #expect(
            FileManager.default.fileExists(
                atPath: runDirectory.appendingPathComponent("pages/page-0001.png").path
            )
        )
        #expect(
            FileManager.default.fileExists(
                atPath: runDirectory
                    .appendingPathComponent(String(format: "pages/page-%04d.png", expectedPageCount))
                    .path
            )
        )
        let pageStore = LocalPageCheckpointStore(
            outputDirectory: runDirectory,
            totalPages: expectedPageCount,
            documentHeader: "# \(pdfURL.lastPathComponent)"
        )
        let pageManifest = try pageStore.loadManifest()
        #expect(pageManifest.completedPageCount == expectedPageCount)
        #expect(pageManifest.currentPageStatus == .succeeded)
        #expect(pageManifest.lastCompletedPageNumber == expectedPageCount)
        #expect(
            FileManager.default.fileExists(
                atPath: pageStore.pageURL(pageNumber: expectedPageCount).path
            )
        )

        let manifestData = try Data(contentsOf: runDirectory.appendingPathComponent("run.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let persisted = try decoder.decode(LocalProcessingRun.self, from: manifestData)
        #expect(persisted.executionMode == "simulation")
        #expect(persisted.status == "succeeded")
        #expect(persisted.structuredOutputPath == runDirectory.appendingPathComponent("result.json").path)
    }

    @Test("Apple Vision writes Markdown for a single-page PDF", .timeLimit(.minutes(1)))
    func appleVisionWritesMarkdownForSinglePagePDF() async throws {
        let workspace = try TestWorkspace(prefix: "okra-vision")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)

        let page = NSView(frame: NSRect(x: 0, y: 0, width: 612, height: 792))
        let label = NSTextField(labelWithString: "Local extraction sample")
        label.font = .systemFont(ofSize: 32)
        label.frame = NSRect(x: 72, y: 640, width: 468, height: 60)
        page.addSubview(label)
        let pdfData = page.dataWithPDF(inside: page.bounds)
        let pdfURL = workspace.root.appendingPathComponent("sample.pdf")
        try pdfData.write(to: pdfURL)

        let result = try await AppleVisionProcessingProvider().process(
            request: LocalProcessingRequest(
                fileName: "sample.pdf",
                sourceURL: pdfURL,
                outputDirectory: workspace.root.appendingPathComponent("output", isDirectory: true),
                expectedPageCount: 1
            ),
            progress: { _, _ in }
        )

        let markdown = try String(contentsOf: result.outputURL, encoding: .utf8)
        #expect(result.pageCount == 1)
        #expect(markdown.contains("# sample.pdf"))
        #expect(markdown.contains("## Page 1"))
        #expect(markdown.contains("Local extraction sample"))
        let pageStore = LocalPageCheckpointStore(
            outputDirectory: workspace.root.appendingPathComponent("output", isDirectory: true),
            totalPages: 1,
            documentHeader: "# sample.pdf"
        )
        let pageManifest = try pageStore.loadManifest()
        #expect(pageManifest.completedPageCount == 1)
        #expect(pageManifest.currentPageStatus == .succeeded)
        #expect(FileManager.default.fileExists(atPath: pageStore.pageURL(pageNumber: 1).path))
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
            let pageDocument = try #require(PDFDocument(data: pageData))
            let page = try #require(pageDocument.page(at: 0))
            document.insert(page, at: index)
        }

        return try #require(document.dataRepresentation())
    }
}
