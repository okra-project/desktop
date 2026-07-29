import AppKit
import Foundation
import PDFKit
import Testing
@testable import Okra

struct HybridAutoProcessingProviderTests {
    @Test("Hybrid progress uses the durable parser lifecycle contract")
    func durablePageLifecycleProgress() async throws {
        let fixture = try HybridProviderFixture(
            pageTexts: [
                "This native PDF paragraph is long enough to pass the quality gate without invoking Chandra."
            ]
        )
        let recorder = PageProgressRecorder()
        let provider = HybridAutoProcessingProvider(chandra: FakeChandraPageParser())

        _ = try await provider.process(
            request: fixture.requestWithProgress { recorder.record($0) },
            progress: { _, _ in }
        )

        #expect(recorder.updates.map(\.parserID) == [.hybridAuto, .hybridAuto])
        #expect(recorder.updates.map(\.state) == [.inProgress, .done])
        #expect(recorder.updates.map(\.pageNumber) == [1, 1])
    }

    @Test("Native-text pages bypass Chandra and record native provenance")
    func nativeTextBypassesChandra() async throws {
        let fixture = try HybridProviderFixture(
            pageTexts: [
                "This native PDF paragraph is long enough to be plausible and must remain byte-for-byte intact."
            ]
        )
        let chandra = FakeChandraPageParser()
        let provider = HybridAutoProcessingProvider(chandra: chandra)

        let result = try await provider.process(request: fixture.request, progress: { _, _ in })
        let markdown = try String(contentsOf: result.outputURL, encoding: .utf8)
        let structured = try StructuredExtractionDocument.load(
            from: try #require(result.structuredOutputURL)
        )
        let nativeText = try fixture.nativeText(pageNumber: 1)

        #expect(chandra.parsedPageNumbers == [])
        #expect(markdown.contains(nativeText))
        #expect(markdown.contains("<!-- okra-page-source: native-text -->"))
        #expect(structured.pages.map(\.provenance) == ["native-text"])
        #expect(structured.pages[0].markdown == nativeText)
    }

    @Test("Scanned pages all route to Chandra")
    func scannedPagesRouteToChandra() async throws {
        let fixture = try HybridProviderFixture(pageTexts: ["", ""])
        let chandra = FakeChandraPageParser()
        let provider = HybridAutoProcessingProvider(chandra: chandra)

        let result = try await provider.process(request: fixture.request, progress: { _, _ in })
        let markdown = try String(contentsOf: result.outputURL, encoding: .utf8)
        let structured = try StructuredExtractionDocument.load(
            from: try #require(result.structuredOutputURL)
        )

        #expect(chandra.parsedPageNumbers == [1, 2])
        #expect(markdown.contains("Chandra page 1"))
        #expect(markdown.contains("Chandra page 2"))
        #expect(markdown.components(separatedBy: "<!-- okra-page-source: chandra -->").count - 1 == 2)
        #expect(structured.pages.map(\.provenance) == ["chandra", "chandra"])
    }

    @Test("Mixed PDFs route only rejected pages to Chandra")
    func mixedPDFRoutesPageLocally() async throws {
        let fixture = try HybridProviderFixture(
            pageTexts: [
                "First native page has a credible paragraph that the hybrid parser should reuse without OCR.",
                "",
                "Third native page is also readable, plausible, and should never be sent through the VLM.",
            ]
        )
        let chandra = FakeChandraPageParser()
        let provider = HybridAutoProcessingProvider(chandra: chandra)

        let result = try await provider.process(request: fixture.request, progress: { _, _ in })
        let structured = try StructuredExtractionDocument.load(
            from: try #require(result.structuredOutputURL)
        )
        let firstNativeText = try fixture.nativeText(pageNumber: 1)
        let thirdNativeText = try fixture.nativeText(pageNumber: 3)

        #expect(chandra.parsedPageNumbers == [2])
        #expect(structured.pages.map(\.provenance) == ["native-text", "chandra", "native-text"])
        #expect(structured.pages[0].markdown == firstNativeText)
        #expect(structured.pages[2].markdown == thirdNativeText)
    }

    @Test(
        "Cancellation preserves page checkpoints and resume skips completed pages",
        .timeLimit(.minutes(1))
    )
    func cancellationAndResume() async throws {
        let fixture = try HybridProviderFixture(pageTexts: ["", "", ""])
        let chandra = FakeChandraPageParser()
        let provider = HybridAutoProcessingProvider(chandra: chandra)
        let pageSaved = DispatchSemaphore(value: 0)
        let continueAfterCancel = DispatchSemaphore(value: 0)
        let request = fixture.requestWithProgress { update in
            guard update.completedPageCount == 1 else { return }
            pageSaved.signal()
            _ = continueAfterCancel.wait(timeout: .now() + 5)
        }

        let firstRun = Task {
            try await provider.process(request: request, progress: { _, _ in })
        }
        try await waitForSemaphore(pageSaved)
        firstRun.cancel()
        continueAfterCancel.signal()

        await #expect(throws: CancellationError.self) {
            try await firstRun.value
        }

        let store = LocalPageCheckpointStore(
            outputDirectory: fixture.outputDirectory,
            totalPages: 3,
            documentHeader: "# hybrid.pdf"
        )
        #expect(try store.status(pageNumber: 1) == .succeeded)
        #expect(try store.status(pageNumber: 2) != .succeeded)

        _ = try await provider.process(request: fixture.request, progress: { _, _ in })

        #expect(chandra.parsedPageNumbers.filter { $0 == 1 }.count == 1)
        #expect(chandra.parsedPageNumbers == [1, 2, 3])
        #expect(try store.loadManifest().completedPageCount == 3)
    }

    @Test("Unavailable Chandra requires setup and install delegates")
    func availabilityAndInstallDelegate() async throws {
        let chandra = FakeChandraPageParser(
            availability: .setupRequired("Chandra is not installed")
        )
        let provider = HybridAutoProcessingProvider(chandra: chandra)

        #expect(
            provider.availability()
                == .setupRequired("Set up Chandra OCR 2 via Ollama to parse scanned pages.")
        )

        try await provider.install(progress: { _ in })
        #expect(chandra.installCallCount == 1)
    }

    @Test("Hybrid provider is in the default picker and parser catalog")
    @MainActor
    func defaultRegistrationAndCatalog() throws {
        let workspace = try TestWorkspace(prefix: "okra-hybrid-registration")
        let coordinator = LocalProcessingCoordinator(
            runsRoot: workspace.runsRoot,
            userDefaults: workspace.defaults
        )

        #expect(coordinator.descriptors.contains { $0.id == .hybridAuto })
        #expect(LocalParserCatalog.hybridAuto.runtime == .hybrid)
        #expect(LocalParserCatalog.hybridAuto.capabilities.contains(.nativeText))
        #expect(LocalParserCatalog.hybridAuto.capabilities.contains(.structuredOutput))
        #expect(
            LocalParserCatalog.hybridAuto.modelDelivery.apiVlmEndpoint
                == LocalParserCatalog.chandra.modelDelivery.apiVlmEndpoint
        )
    }
}

private final class PageProgressRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedUpdates: [LocalPageProgressUpdate] = []

    var updates: [LocalPageProgressUpdate] {
        lock.withLock { recordedUpdates }
    }

    func record(_ update: LocalPageProgressUpdate) {
        lock.withLock { recordedUpdates.append(update) }
    }
}

private final class FakeChandraPageParser: ChandraPageParsing, @unchecked Sendable {
    private let lock = NSLock()
    private let availabilityValue: LocalProviderAvailability
    private var parsedPages: [Int] = []
    private var installs = 0

    init(availability: LocalProviderAvailability = .ready) {
        availabilityValue = availability
    }

    var parsedPageNumbers: [Int] {
        lock.withLock { parsedPages }
    }

    var installCallCount: Int {
        lock.withLock { installs }
    }

    func availability() -> LocalProviderAvailability {
        availabilityValue
    }

    func install(
        progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void
    ) async throws {
        lock.withLock { installs += 1 }
    }

    func prepareForParsing() async throws {}

    func parsePage(
        request: ChandraPageParsingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> ChandraPageParsingResult {
        try Task.checkCancellation()
        lock.withLock { parsedPages.append(request.pageNumber) }
        let text = "Chandra page \(request.pageNumber)"
        return ChandraPageParsingResult(
            markdown: text,
            structuredPage: StructuredExtractionPage(
                pageNumber: request.pageNumber,
                imageFile: request.imageURL.lastPathComponent,
                markdown: text,
                plainText: text,
                blocks: [],
                diagnostics: StructuredExtractionDiagnostics(
                    rawCharacterCount: text.count,
                    decodedCharacterCount: text.count,
                    tokenArtifactCount: 0,
                    detectionCount: 0,
                    malformedDetectionCount: 0,
                    duplicateBlockCount: 0,
                    loopDetected: false,
                    warnings: []
                )
            )
        )
    }
}

private final class HybridProviderFixture {
    let workspace: TestWorkspace
    let sourceURL: URL
    let outputDirectory: URL
    let pageTexts: [String]

    init(pageTexts: [String]) throws {
        self.pageTexts = pageTexts
        workspace = try TestWorkspace(prefix: "okra-hybrid-provider")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        sourceURL = workspace.root.appendingPathComponent("hybrid.pdf")
        outputDirectory = workspace.root.appendingPathComponent("output", isDirectory: true)
        try Self.makePDF(pageTexts: pageTexts).write(to: sourceURL)
    }

    var request: LocalProcessingRequest {
        requestWithProgress { _ in }
    }

    func requestWithProgress(
        _ pageProgress: @escaping LocalPageProgress
    ) -> LocalProcessingRequest {
        LocalProcessingRequest(
            parserID: .hybridAuto,
            fileName: "hybrid.pdf",
            sourceURL: sourceURL,
            outputDirectory: outputDirectory,
            expectedPageCount: pageTexts.count,
            pageProgress: pageProgress
        )
    }

    func nativeText(pageNumber: Int) throws -> String {
        let document = try #require(PDFDocument(url: sourceURL))
        let page = try #require(document.page(at: pageNumber - 1))
        return try #require(page.string)
    }

    private static func makePDF(pageTexts: [String]) throws -> Data {
        let document = PDFDocument()

        for (index, text) in pageTexts.enumerated() {
            let pageView = HybridPDFPageView(text: text)
            let pageData = pageView.dataWithPDF(inside: pageView.bounds)
            let pageDocument = try #require(PDFDocument(data: pageData))
            let page = try #require(pageDocument.page(at: 0))
            document.insert(page, at: index)
        }

        return try #require(document.dataRepresentation())
    }
}

private final class HybridPDFPageView: NSView {
    private let text: String

    init(text: String) {
        self.text = text
        super.init(frame: NSRect(x: 0, y: 0, width: 612, height: 792))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError()
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let attributed = NSAttributedString(
            string: text,
            attributes: [.font: NSFont.systemFont(ofSize: 18)]
        )
        attributed.draw(
            with: NSRect(x: 36, y: 600, width: 540, height: 120),
            options: [.usesLineFragmentOrigin]
        )
    }
}

private func waitForSemaphore(
    _ semaphore: DispatchSemaphore
) async throws {
    let result = await withCheckedContinuation { continuation in
        DispatchQueue.global(qos: .utility).async {
            continuation.resume(returning: semaphore.wait(timeout: .now() + 5))
        }
    }
    guard result == .success else {
        throw AsyncTestTimeoutError.conditionNotMet("page checkpoint callback")
    }
}
