import Foundation

/// Chandra OCR 2 served locally over Ollama's OpenAI-compatible endpoint.
///
/// Unlike the mlx-vlm providers, no weights are downloaded or bundled by the app:
/// Ollama owns the model store. Setup pulls the base model and `ollama create`s a
/// `okra-chandra` variant that bakes `num_ctx` (Ollama's /v1 ignores a per-request
/// num_ctx, and a page image's vision tokens overflow the default window). Parsing
/// shells the shared `chandra-worker.py` in `--endpoint` mode — the same worker,
/// projection, and checkpoint contract as the mlx path, just a different backend.
final class ChandraProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
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
        guard availability().isReady else {
            throw LocalProcessingError.providerUnavailable("Set up Chandra OCR 2 before extracting.")
        }
        guard let workerURL else {
            throw LocalProcessingError.missingResource("Chandra worker")
        }
        // The endpoint probe is async, so it lives here rather than in availability().
        guard await OllamaClient.listModels(baseURL: endpoint.baseURL) != nil else {
            throw LocalProcessingError.providerUnavailable(
                "Ollama server is not running. Start Ollama and try again."
            )
        }

        let endpoint = self.endpoint
        let pythonURL = self.pythonURL
        let lockRoot = self.lockRoot

        let worker = Task.detached(priority: .userInitiated) {
            try Task.checkCancellation()
            try FileManager.default.createDirectory(at: request.outputDirectory, withIntermediateDirectories: true)
            let pagesDirectory = request.outputDirectory.appendingPathComponent("pages", isDirectory: true)
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
            let initialManifest = try pageStore.prepare()
            if initialManifest.completedPageCount < pageURLs.count,
               let nextPage = (1...pageURLs.count).first(where: {
                   (try? pageStore.status(pageNumber: $0)) != .succeeded
               }) {
                try pageStore.markProcessing(pageNumber: nextPage)
                request.pageProgress(
                    LocalPageProgressUpdate(
                        parserID: request.parserID,
                        pageNumber: nextPage,
                        state: .inProgress,
                        completedPageCount: initialManifest.completedPageCount,
                        totalPageCount: pageURLs.count,
                        message: "Parsing page \(nextPage) of \(pageURLs.count)"
                    )
                )
            }
            let outputURL = pageStore.resultURL
            progress(0.22, "Sending pages to Chandra via Ollama")

            var arguments = [
                workerURL.path,
                "--endpoint", endpoint.baseURL,
                "--model", endpoint.model,
                "--output", outputURL.path,
                "--page-output-directory", pageStore.pagesDirectory.path,
                "--page-progress", pageStore.manifestURL.path,
                "--title", request.fileName,
                "--images",
            ]
            arguments.append(contentsOf: pageURLs.map(\.path))

            // Serialize this app's own Chandra runs; Ollama also queues internally.
            try FileManager.default.createDirectory(at: lockRoot, withIntermediateDirectories: true)
            let runGate = LocalExclusiveFileLock(url: lockRoot.appendingPathComponent("worker.lock"))
            try await runGate.acquire {
                progress(0.22, "Waiting for another Chandra run to finish…")
            }
            defer { runGate.release() }

            let monitorTask = Task.detached(priority: .utility) {
                var observedPageCount = initialManifest.completedPageCount
                while Task.isCancelled == false {
                    if let manifest = try? pageStore.loadManifest(),
                       manifest.completedPageCount > observedPageCount {
                        let newCompletedPageCount = manifest.completedPageCount
                        for completedPageCount in (observedPageCount + 1)...newCompletedPageCount {
                            request.pageProgress(
                                LocalPageProgressUpdate(
                                    parserID: request.parserID,
                                    pageNumber: completedPageCount,
                                    state: .done,
                                    completedPageCount: completedPageCount,
                                    totalPageCount: pageURLs.count,
                                    message: "Saved page \(completedPageCount) of \(pageURLs.count)"
                                )
                            )
                            if completedPageCount < pageURLs.count {
                                request.pageProgress(
                                    LocalPageProgressUpdate(
                                        parserID: request.parserID,
                                        pageNumber: completedPageCount + 1,
                                        state: .inProgress,
                                        completedPageCount: completedPageCount,
                                        totalPageCount: pageURLs.count,
                                        message: "Parsing page \(completedPageCount + 1) of \(pageURLs.count)"
                                    )
                                )
                            }
                            progress(
                                0.2 + (0.8 * Double(completedPageCount) / Double(pageURLs.count)),
                                "Saved page \(completedPageCount) of \(pageURLs.count)"
                            )
                        }
                        observedPageCount = newCompletedPageCount
                    }
                    guard observedPageCount < pageURLs.count else { return }
                    try? await Task.sleep(for: .milliseconds(100))
                }
            }

            do {
                _ = try await LocalCommandRunner.runAsync(
                    executableURL: pythonURL,
                    arguments: arguments
                )
            } catch {
                monitorTask.cancel()
                await monitorTask.value
                let completedPages = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                if completedPages < pageURLs.count, !(error is CancellationError) {
                    try? pageStore.markFailed(pageNumber: completedPages + 1, error: error)
                }
                if completedPages < pageURLs.count {
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: completedPages + 1,
                            state: error is CancellationError ? .attention : .error,
                            completedPageCount: completedPages,
                            totalPageCount: pageURLs.count,
                            message: error is CancellationError
                                ? "Canceled. Resume to continue page \(completedPages + 1)."
                                : error.localizedDescription
                        )
                    )
                }
                throw error
            }

            monitorTask.cancel()
            await monitorTask.value
            let manifest = try pageStore.reconcileCompletedPages()
            if manifest.completedPageCount > 0 {
                request.pageProgress(
                    LocalPageProgressUpdate(
                        parserID: request.parserID,
                        pageNumber: manifest.lastCompletedPageNumber ?? manifest.completedPageCount,
                        state: .done,
                        completedPageCount: manifest.completedPageCount,
                        totalPageCount: pageURLs.count,
                        message: "Saved page \(manifest.lastCompletedPageNumber ?? manifest.completedPageCount) of \(pageURLs.count)"
                    )
                )
            }
            _ = try pageStore.assembleResult()
            let structuredOutputURL = outputURL.deletingPathExtension().appendingPathExtension("json")
            guard FileManager.default.fileExists(atPath: structuredOutputURL.path) else {
                throw LocalProcessingError.missingOutput("Chandra OCR 2 structured JSON")
            }
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
}
