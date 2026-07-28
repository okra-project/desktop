import Foundation

final class HybridAutoProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .hybridAuto,
        name: "Auto (Hybrid)",
        summary: "Reuses native PDF text instantly; sends scanned pages to Chandra OCR 2 via Ollama.",
        setupNote: "Requires the same one-time Chandra OCR 2 setup as the standalone Chandra parser.",
        parserDefinition: LocalParserCatalog.hybridAuto
    )

    private let chandra: any ChandraPageParsing
    private let qualityGate: NativePDFTextQualityGate

    init(
        chandra: any ChandraPageParsing = ChandraProcessingProvider(),
        qualityGate: NativePDFTextQualityGate = NativePDFTextQualityGate()
    ) {
        self.chandra = chandra
        self.qualityGate = qualityGate
    }

    func availability() -> LocalProviderAvailability {
        guard chandra.availability().isReady else {
            return .setupRequired(
                "Set up Chandra OCR 2 via Ollama to parse scanned pages."
            )
        }
        return .ready
    }

    func install(
        progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void
    ) async throws {
        try await chandra.install(progress: progress)
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        guard availability().isReady else {
            throw LocalProcessingError.providerUnavailable(
                "Set up Chandra OCR 2 before using Auto (Hybrid)."
            )
        }
        let chandra = self.chandra
        let qualityGate = self.qualityGate

        let worker = Task.detached(priority: .userInitiated) {
            let document = try PDFPageRenderer.openDocument(at: request.sourceURL)
            let pageStore = LocalPageCheckpointStore(
                outputDirectory: request.outputDirectory,
                totalPages: document.pageCount,
                documentHeader: "# \(request.fileName)"
            )
            try pageStore.prepare()
            let renderedPagesDirectory = request.outputDirectory.appendingPathComponent(
                "pages",
                isDirectory: true
            )
            var chandraIsPrepared = false
            var structuredPages: [StructuredExtractionPage] = []

            for index in 0..<document.pageCount {
                try Task.checkCancellation()
                let pageNumber = index + 1
                if try pageStore.status(pageNumber: pageNumber) == .succeeded {
                    let structuredPage = try StructuredExtractionPersistence.loadPage(
                        from: pageStore.pagesDirectory,
                        pageNumber: pageNumber
                    )
                    structuredPages.append(structuredPage)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: document.pageCount,
                            message: "Restored page \(pageNumber) of \(document.pageCount) from disk"
                        )
                    )
                    progress(
                        Double(manifest.completedPageCount) / Double(document.pageCount),
                        "Restored page \(pageNumber) of \(document.pageCount) from disk"
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
                        totalPageCount: document.pageCount,
                        message: "Routing page \(pageNumber) of \(document.pageCount)"
                    )
                )
                do {
                    guard let page = document.page(at: index) else {
                        throw LocalProcessingError.invalidPDF
                    }
                    let nativeText = page.string
                    let bounds = page.bounds(for: .cropBox)
                    let pageArea = Double(bounds.width * bounds.height)
                    let structuredPage: StructuredExtractionPage
                    let source: String

                    switch qualityGate.evaluate(text: nativeText, pageArea: pageArea) {
                    case .accepted:
                        progress(
                            Double(index) / Double(document.pageCount),
                            "Reusing native text on page \(pageNumber) of \(document.pageCount)"
                        )
                        source = "native-text"
                        structuredPage = Self.nativeStructuredPage(
                            pageNumber: pageNumber,
                            text: nativeText ?? ""
                        )
                    case .rejected:
                        if chandraIsPrepared == false {
                            try await chandra.prepareForParsing()
                            chandraIsPrepared = true
                        }
                        progress(
                            Double(index) / Double(document.pageCount),
                            "Sending page \(pageNumber) of \(document.pageCount) to Chandra"
                        )
                        let imageURL = renderedPagesDirectory.appendingPathComponent(
                            String(format: "page-%04d.png", pageNumber)
                        )
                        try PDFPageRenderer.writePagePNG(
                            from: document,
                            at: index,
                            to: imageURL,
                            maxDimension: 2_048
                        )
                        let parsed = try await chandra.parsePage(
                            request: ChandraPageParsingRequest(
                                pageNumber: pageNumber,
                                imageURL: imageURL
                            ),
                            progress: { _, message in
                                progress(
                                    Double(index) / Double(document.pageCount),
                                    message
                                )
                            }
                        )
                        source = "chandra"
                        structuredPage = parsed.structuredPage.routed(
                            to: pageNumber,
                            imageFile: imageURL.lastPathComponent,
                            provenance: source
                        )
                    }

                    try StructuredExtractionPersistence.write(
                        page: structuredPage,
                        to: pageStore.pagesDirectory
                    )
                    try pageStore.writePage(
                        pageNumber: pageNumber,
                        markdown: Self.pageMarkdown(
                            pageNumber: pageNumber,
                            source: source,
                            text: structuredPage.markdown
                        )
                    )
                    structuredPages.append(structuredPage)
                    let manifest = try pageStore.reconcileCompletedPages()
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .done,
                            completedPageCount: manifest.completedPageCount,
                            totalPageCount: document.pageCount,
                            message: "Saved page \(pageNumber) of \(document.pageCount) · \(source)"
                        )
                    )
                    progress(
                        Double(manifest.completedPageCount) / Double(document.pageCount),
                        "Saved page \(pageNumber) of \(document.pageCount) · \(source)"
                    )
                } catch is CancellationError {
                    let completed = (try? pageStore.reconcileCompletedPages().completedPageCount) ?? 0
                    request.pageProgress(
                        LocalPageProgressUpdate(
                            parserID: request.parserID,
                            pageNumber: pageNumber,
                            state: .attention,
                            completedPageCount: completed,
                            totalPageCount: document.pageCount,
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
                            totalPageCount: document.pageCount,
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
                        id: LocalProviderID.hybridAuto.rawValue,
                        name: "Auto (Hybrid)"
                    ),
                    title: request.fileName,
                    pageCount: document.pageCount,
                    completedPageCount: structuredPages.count,
                    complete: structuredPages.count == document.pageCount,
                    simulation: false,
                    pages: structuredPages.sorted { $0.pageNumber < $1.pageNumber }
                ),
                to: structuredOutputURL
            )
            progress(1, "Hybrid extraction complete")
            return LocalProcessingResult(
                outputURL: outputURL,
                pageCount: document.pageCount,
                structuredOutputURL: structuredOutputURL
            )
        }

        return try await withTaskCancellationHandler {
            try await worker.value
        } onCancel: {
            worker.cancel()
        }
    }

    private static func nativeStructuredPage(
        pageNumber: Int,
        text: String
    ) -> StructuredExtractionPage {
        StructuredExtractionPage(
            pageNumber: pageNumber,
            imageFile: "",
            markdown: text,
            plainText: text,
            blocks: [
                StructuredExtractionBlock(
                    id: "page-\(pageNumber)-block-1",
                    type: "text",
                    sourceType: "native-text",
                    text: text,
                    bbox: nil,
                    sourceBbox: nil,
                    sourceBboxScale: nil
                ),
            ],
            diagnostics: StructuredExtractionDiagnostics(
                rawCharacterCount: text.count,
                decodedCharacterCount: text.count,
                tokenArtifactCount: 0,
                detectionCount: 1,
                malformedDetectionCount: 0,
                duplicateBlockCount: 0,
                loopDetected: false,
                warnings: []
            ),
            provenance: "native-text"
        )
    }

    private static func pageMarkdown(
        pageNumber: Int,
        source: String,
        text: String
    ) -> String {
        "## Page \(pageNumber)\n\n<!-- okra-page-source: \(source) -->\n\n\(text)"
    }
}
