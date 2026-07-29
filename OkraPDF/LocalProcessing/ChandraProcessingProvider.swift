import Foundation

/// Chandra OCR 2 served locally over Ollama's OpenAI-compatible endpoint.
///
/// Unlike the mlx-vlm providers, no weights are downloaded or bundled by the app:
/// Ollama owns the model store. Setup pulls the base model and `ollama create`s a
/// `okra-chandra` variant that bakes `num_ctx` (Ollama's /v1 ignores a per-request
/// num_ctx, and a page image's vision tokens overflow the default window). Parsing
/// shells the shared `chandra-worker.py` in `--endpoint` mode — the same worker,
/// projection, and checkpoint contract as the mlx path, just a different backend.
final class ChandraProcessingProvider: LocalProcessingProvider, ChandraPageParsing, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .chandra,
        name: "Chandra OCR 2",
        summary: "Datalab's document VLM, served locally through Ollama.",
        setupNote: "Requires Ollama (install from ollama.com). One-time ~3.4 GB model download; "
            + "runs fully offline after. License: modified OpenRAIL-M (use restrictions + share-alike).",
        parserDefinition: LocalParserCatalog.chandra
    )

    private let endpoint: ApiVlmEndpoint
    private let workerURL: URL?
    private let modelfileURL: URL?
    private let pythonURL: URL
    private let lockRoot: URL

    init() {
        endpoint = LocalParserCatalog.chandra.modelDelivery.apiVlmEndpoint ?? ApiVlmEndpoint(
            baseURL: "http://localhost:11434/v1", model: "okra-chandra:q4", runtimeType: .ollama,
            responseFormat: "html-databbox", timeoutSeconds: 1_800, renderScale: 2.0,
            ollamaBaseModel: "ahmgam/chandra-ocr-2:q4", numCtx: 8_192, approxDownloadBytes: 3_400_000_000
        )
        workerURL = ProviderResources.scriptURL(named: "chandra-worker", extension: "py")
        modelfileURL = ProviderResources.scriptURL(named: "Modelfile", extension: "chandra")
        pythonURL = Self.systemPython()
        lockRoot = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".okra/providers/chandra", isDirectory: true)
    }

    static func systemPython() -> URL {
        let candidates = [
            "/opt/homebrew/bin/python3.13", "/opt/homebrew/bin/python3.12",
            "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3",
        ].map { URL(fileURLWithPath: $0) }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0.path) }
            ?? URL(fileURLWithPath: "/usr/bin/python3")
    }

    /// Synchronous — filesystem + binary presence only, no network (the endpoint
    /// probe happens in `process()`, which is async).
    func availability() -> LocalProviderAvailability {
        let fm = FileManager.default
        guard let workerURL, fm.fileExists(atPath: workerURL.path) else {
            return .unavailable("Bundled worker missing")
        }
        guard fm.isExecutableFile(atPath: pythonURL.path) else {
            return .unavailable("Python 3 is required")
        }
        guard OllamaClient.isInstalled else {
            return .unavailable("Install Ollama from ollama.com to use Chandra")
        }
        return OllamaClient.hasLocalModel(endpoint.model)
            ? .ready
            : .setupRequired("Set up Chandra · ~3.4 GB")
    }

    func install(progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void) async throws {
        guard OllamaClient.isInstalled else {
            throw LocalProcessingError.providerUnavailable(
                "Ollama is not installed. Install it from https://ollama.com, then set up Chandra."
            )
        }
        guard let modelfileURL else {
            throw LocalProcessingError.missingResource("Chandra Modelfile")
        }
        guard let baseModel = endpoint.ollamaBaseModel else {
            throw LocalProcessingError.missingResource("Chandra base model reference")
        }

        progress(LocalProviderSetupProgress(phase: .preparing, fraction: nil,
                                            message: "Checking the Ollama runtime…"))
        guard await OllamaClient.listModels(baseURL: endpoint.baseURL) != nil else {
            throw LocalProcessingError.providerUnavailable(
                "Ollama is installed but not running. Start Ollama, then set up Chandra."
            )
        }

        progress(LocalProviderSetupProgress(phase: .downloadingModel, fraction: nil,
                                            message: "Downloading Chandra via Ollama (~3.4 GB)…"))
        try await OllamaClient.pull(baseModel)
        try Task.checkCancellation()

        progress(LocalProviderSetupProgress(phase: .installingRuntime, fraction: nil,
                                            message: "Configuring Chandra for document parsing…"))
        try await OllamaClient.create(name: endpoint.model, modelfileURL: modelfileURL)

        progress(LocalProviderSetupProgress(phase: .ready, fraction: 1,
                                            message: "Chandra OCR 2 is ready offline."))
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        try await prepareForParsing()

        let worker = Task.detached(priority: .userInitiated) {
            try Task.checkCancellation()
            try FileManager.default.createDirectory(at: request.outputDirectory, withIntermediateDirectories: true)
            let pagesDirectory = request.outputDirectory.appendingPathComponent(
                "pages",
                isDirectory: true
            )
            let pageURLs = try PDFPageRenderer.writePagePNGs(
                from: request.sourceURL,
                to: pagesDirectory,
                maxDimension: 2_048,
                progress: progress
            )
            let pageStore = LocalPageCheckpointStore(
                outputDirectory: request.outputDirectory,
                totalPages: pageURLs.count,
                documentHeader: "# \(request.fileName)"
            )
            try pageStore.prepare()
            var structuredPages: [StructuredExtractionPage] = []

            for (index, pageURL) in pageURLs.enumerated() {
                try Task.checkCancellation()
                let pageNumber = index + 1
                if try pageStore.status(pageNumber: pageNumber) == .succeeded,
                   let page = try? StructuredExtractionPersistence.loadPage(
                       from: pageStore.pagesDirectory,
                       pageNumber: pageNumber
                   ) {
                    structuredPages.append(page)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: pageURLs.count,
                            message: "Restored page \(pageNumber) of \(pageURLs.count) from disk"
                        )
                    )
                    progress(
                        Double(manifest.completedPageCount) / Double(pageURLs.count),
                        "Restored page \(pageNumber) of \(pageURLs.count) from disk"
                    )
                    continue
                }

                let progressManifest = try pageStore.reconcileCompletedPages()
                try pageStore.markProcessing(pageNumber: pageNumber)
                request.pageProgress(
                    LocalPageProgressUpdate(
                        parserID: request.parserID,
                        pageNumber: pageNumber,
                        state: .inProgress,
                        completedPageCount: progressManifest.completedPageCount,
                        totalPageCount: pageURLs.count,
                        message: "Parsing page \(pageNumber) of \(pageURLs.count) with Chandra"
                    )
                )
                do {
                    progress(
                        Double(index) / Double(pageURLs.count),
                        "Sending page \(pageNumber) of \(pageURLs.count) to Chandra via Ollama"
                    )
                    let parsed = try await self.parsePage(
                        request: ChandraPageParsingRequest(
                            pageNumber: pageNumber,
                            imageURL: pageURL
                        ),
                        progress: { _, message in
                            progress(
                                Double(index) / Double(pageURLs.count),
                                message
                            )
                        }
                    )
                    try StructuredExtractionPersistence.write(
                        page: parsed.structuredPage,
                        to: pageStore.pagesDirectory
                    )
                    try pageStore.writePage(
                        pageNumber: pageNumber,
                        markdown: "## Page \(pageNumber)\n\n\(parsed.markdown)"
                    )
                    structuredPages.append(parsed.structuredPage)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: pageURLs.count,
                            message: "Saved page \(pageNumber) of \(pageURLs.count)"
                        )
                    )
                    progress(
                        Double(manifest.completedPageCount) / Double(pageURLs.count),
                        "Saved page \(pageNumber) of \(pageURLs.count)"
                    )
                } catch is CancellationError {
                    let completed = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .attention,
                            completedPageCount: completed,
                            totalPageCount: pageURLs.count,
                            message: "Canceled. Resume to continue page \(pageNumber)."
                        )
                    )
                    throw CancellationError()
                } catch {
                    try? pageStore.markFailed(pageNumber: pageNumber, error: error)
                    let completed = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .error,
                            completedPageCount: completed,
                            totalPageCount: pageURLs.count,
                            message: error.localizedDescription
                        )
                    )
                    throw error
                }
            }

            let outputURL = try pageStore.assembleResult()
            let structuredOutputURL = outputURL
                .deletingPathExtension()
                .appendingPathExtension("json")
            try StructuredExtractionPersistence.write(
                document: StructuredExtractionDocument(
                    schemaVersion: 1,
                    object: "local_extraction",
                    provider: StructuredExtractionProvider(
                        id: "chandra",
                        name: "Chandra OCR 2"
                    ),
                    title: request.fileName,
                    pageCount: pageURLs.count,
                    completedPageCount: structuredPages.count,
                    complete: structuredPages.count == pageURLs.count,
                    simulation: false,
                    pages: structuredPages.sorted { $0.pageNumber < $1.pageNumber }
                ),
                to: structuredOutputURL
            )
            progress(1, "Extraction complete")
            return LocalProcessingResult(
                outputURL: outputURL,
                pageCount: pageURLs.count,
                structuredOutputURL: structuredOutputURL
            )
        }

        return try await withTaskCancellationHandler {
            try await worker.value
        } onCancel: {
            worker.cancel()
        }
    }

    func prepareForParsing() async throws {
        guard availability().isReady else {
            throw LocalProcessingError.providerUnavailable(
                "Set up Chandra OCR 2 before extracting."
            )
        }
        guard await OllamaClient.listModels(baseURL: endpoint.baseURL) != nil else {
            throw LocalProcessingError.providerUnavailable(
                "Ollama server is not running. Start Ollama and try again."
            )
        }
    }

    func parsePage(
        request: ChandraPageParsingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> ChandraPageParsingResult {
        guard let workerURL else {
            throw LocalProcessingError.missingResource("Chandra worker")
        }
        let scratchDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("okra-chandra-page-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: scratchDirectory) }

        let scratchStore = LocalPageCheckpointStore(
            outputDirectory: scratchDirectory,
            totalPages: 1,
            documentHeader: "# Page \(request.pageNumber)"
        )
        try scratchStore.prepare()

        let arguments = [
            workerURL.path,
            "--endpoint", endpoint.baseURL,
            "--model", endpoint.model,
            "--output", scratchStore.resultURL.path,
            "--page-output-directory", scratchStore.pagesDirectory.path,
            "--page-progress", scratchStore.manifestURL.path,
            "--title", "Page \(request.pageNumber)",
            "--images", request.imageURL.path,
        ]

        try FileManager.default.createDirectory(
            at: lockRoot,
            withIntermediateDirectories: true
        )
        let runGate = LocalExclusiveFileLock(
            url: lockRoot.appendingPathComponent("worker.lock")
        )
        try await runGate.acquire {
            progress(0, "Waiting for another Chandra run to finish…")
        }
        defer { runGate.release() }

        _ = try await LocalCommandRunner.runAsync(
            executableURL: pythonURL,
            arguments: arguments
        )
        let parsedPage = try StructuredExtractionPersistence.loadPage(
            from: scratchStore.pagesDirectory,
            pageNumber: 1
        ).routed(
            to: request.pageNumber,
            imageFile: request.imageURL.lastPathComponent,
            provenance: nil
        )
        return ChandraPageParsingResult(
            markdown: parsedPage.markdown,
            structuredPage: parsedPage
        )
    }
}
