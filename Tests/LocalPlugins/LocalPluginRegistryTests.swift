import Foundation
import Testing
@testable import Okra

struct LocalPluginRegistryTests {
    @Test("Built-in registry declares Presidio as an offline runtime operation")
    func registryMetadata() throws {
        let definition = try #require(LocalPluginRegistry.standard.definitions.first)

        #expect(LocalPluginRegistry.standard.definitions.count == 1)
        #expect(definition.id == .presidioNER)
        #expect(definition.name == "Presidio NER")
        #expect(definition.publisher == "Data Privacy Stack")
        #expect(definition.operations.map(\.id) == ["detect"])
        #expect(definition.permissions.setupRequiresNetwork)
        #expect(definition.permissions.runtimeAllowsNetwork == false)
        #expect(definition.permissions.readsExtractedText)
        #expect(definition.permissions.writesInsideRunDirectory)
        #expect(WorkspaceToolRegistry.withPresidio.tools.map(\.id) == [.extract, .presidioNER])
        #expect(WorkspaceToolDefinition.presidioNER.name == "Detect PII")
        #expect(WorkspaceToolDefinition.presidioNER.category == .privacy)
    }

    @Test("Structured Baidu blocks retain their normalized page box")
    func structuredRequestMapping() throws {
        let workspace = try TestWorkspace(prefix: "okra-presidio-structured")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let markdownURL = workspace.root.appendingPathComponent("result.md")
        let structuredURL = workspace.root.appendingPathComponent("result.json")
        try Data("Jane Doe".utf8).write(to: markdownURL)

        let document = StructuredExtractionDocument(
            schemaVersion: 1,
            object: "okra.structured-extraction",
            provider: StructuredExtractionProvider(id: "unlimited-ocr", name: "Baidu Unlimited-OCR"),
            title: "fixture.pdf",
            pageCount: 1,
            completedPageCount: 1,
            complete: true,
            simulation: false,
            pages: [
                StructuredExtractionPage(
                    pageNumber: 1,
                    imageFile: "page-0001.png",
                    markdown: "Jane Doe",
                    plainText: "Jane Doe",
                    blocks: [
                        StructuredExtractionBlock(
                            id: "block-1",
                            type: "text",
                            sourceType: "text",
                            text: "Jane Doe",
                            bbox: StructuredExtractionBoundingBox(
                                x: 0.1,
                                y: 0.2,
                                width: 0.3,
                                height: 0.04,
                                unit: "normalized",
                                origin: "top-left"
                            ),
                            sourceBbox: nil,
                            sourceBboxScale: nil
                        ),
                    ],
                    diagnostics: StructuredExtractionDiagnostics(
                        rawCharacterCount: 8,
                        decodedCharacterCount: 8,
                        tokenArtifactCount: 0,
                        detectionCount: 1,
                        malformedDetectionCount: 0,
                        duplicateBlockCount: 0,
                        loopDetected: false,
                        warnings: []
                    )
                ),
            ]
        )
        let encoder = JSONEncoder()
        try encoder.encode(document).write(to: structuredURL)

        let request = try PresidioDetectionRequest.build(
            sourceOutputURL: markdownURL,
            structuredOutputURL: structuredURL,
            entities: ["PERSON"],
            minScore: 0.35
        )

        #expect(request.nodes.count == 1)
        #expect(request.nodes[0].page == 1)
        #expect(request.nodes[0].text == "Jane Doe")
        #expect(request.nodes[0].bbox == PIIBoundingBox(x: 0.1, y: 0.2, w: 0.3, h: 0.04))
    }

    @Test("Markdown-only extraction is bounded into text-only analyzer nodes")
    func markdownRequestChunking() throws {
        let workspace = try TestWorkspace(prefix: "okra-presidio-markdown")
        try FileManager.default.createDirectory(at: workspace.root, withIntermediateDirectories: true)
        let markdownURL = workspace.root.appendingPathComponent("result.md")
        try String(repeating: "a", count: 100_001).write(
            to: markdownURL,
            atomically: true,
            encoding: .utf8
        )

        let request = try PresidioDetectionRequest.build(
            sourceOutputURL: markdownURL,
            structuredOutputURL: nil,
            entities: ["PERSON"],
            minScore: -1
        )

        #expect(request.nodes.count == 2)
        #expect(request.nodes[0].text.count == 100_000)
        #expect(request.nodes[1].text.count == 1)
        #expect(request.nodes.allSatisfy { $0.page == nil && $0.bbox == nil })
        #expect(request.minScore == 0)
    }

    @Test("Simulated Presidio plugin persists a reloadable run artifact")
    @MainActor
    func simulatedInvocationAndReload() async throws {
        let workspace = try TestWorkspace(prefix: "okra-presidio-simulation")
        let runDirectory = workspace.runsRoot.appendingPathComponent("run-1", isDirectory: true)
        try FileManager.default.createDirectory(at: runDirectory, withIntermediateDirectories: true)
        let outputURL = runDirectory.appendingPathComponent("result.md")
        try Data("Contact Jane Doe at jane@example.com.".utf8).write(to: outputURL)

        let pluginRoot = workspace.root.appendingPathComponent("plugin", isDirectory: true)
        let runtime = PresidioNERPlugin(
            rootURL: pluginRoot,
            pythonURL: pluginRoot.appendingPathComponent("venv/bin/python"),
            readyMarkerURL: pluginRoot.appendingPathComponent(".ready"),
            environment: ["OKRA_DESKTOP_SIMULATE_PRESIDIO": "1"]
        )
        let registry = LocalPluginRegistry(runtimes: [runtime])
        let coordinator = LocalPluginCoordinator(registry: registry)
        let run = LocalProcessingRun(
            id: "run-1",
            sourcePath: workspace.root.appendingPathComponent("fixture.pdf").path,
            fileName: "fixture.pdf",
            providerId: "unlimited-ocr",
            providerName: "Baidu Unlimited-OCR",
            executionMode: "simulation",
            status: "succeeded",
            outputPath: outputURL.path,
            errorMessage: nil,
            pageCount: 1,
            startedAt: Date(),
            completedAt: Date()
        )

        #expect(coordinator.availability(for: .presidioNER).isSimulated)
        #expect(coordinator.canInvoke(.presidioNER, on: run))
        coordinator.invoke(.presidioNER, on: run)
        try await waitUntil("Presidio simulation to finish") { coordinator.isRunning == false }

        let detection = try #require(coordinator.latestDetection)
        #expect(detection.stats.total == 2)
        #expect(Set(detection.findings.map(\.entityType)) == ["PERSON", "EMAIL_ADDRESS"])
        #expect(coordinator.latestResultURL?.lastPathComponent == "result.json")

        let reloaded = LocalPluginCoordinator(registry: registry)
        reloaded.load(run: run)
        #expect(reloaded.latestDetection == detection)
    }
}
