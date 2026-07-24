import Foundation

final class UnlimitedOCRProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .unlimitedOCR,
        name: "Unlimited-OCR",
        summary: "High-fidelity document parsing through MLX, optimized for Apple silicon.",
        setupNote: "One-time ~2.4 GB model download. Extraction is forced offline after setup."
    )

    func availability() -> LocalProviderAvailability {
        let fm = FileManager.default
        let isReady = fm.fileExists(atPath: LocalProviderPaths.unlimitedOCRReadyMarker.path)
            && fm.isExecutableFile(atPath: LocalProviderPaths.unlimitedOCRPython.path)
            && fm.fileExists(atPath: LocalProviderPaths.unlimitedOCRModel.path)
        return isReady ? .ready : .setupRequired("Setup required · ~2.4 GB")
    }

    func install() async throws {
        guard let scriptURL = Bundle.module.url(
            forResource: "install-unlimited-ocr",
            withExtension: "sh",
            subdirectory: "ProviderScripts"
        ) else {
            throw LocalProcessingError.missingResource("Unlimited-OCR installer")
        }
        let root = LocalProviderPaths.unlimitedOCRRoot
        try await Task.detached(priority: .userInitiated) {
            _ = try LocalCommandRunner.run(
                executableURL: URL(fileURLWithPath: "/bin/zsh"),
                arguments: [scriptURL.path, root.path]
            )
        }.value
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        guard availability().isReady else {
            throw LocalProcessingError.providerUnavailable("Set up Unlimited-OCR before extracting.")
        }
        guard let workerURL = Bundle.module.url(
            forResource: "unlimited-ocr-worker",
            withExtension: "py",
            subdirectory: "ProviderScripts"
        ) else {
            throw LocalProcessingError.missingResource("Unlimited-OCR worker")
        }

        return try await Task.detached(priority: .userInitiated) {
            try FileManager.default.createDirectory(
                at: request.outputDirectory,
                withIntermediateDirectories: true
            )
            let pagesDirectory = request.outputDirectory.appendingPathComponent("pages", isDirectory: true)
            let pageURLs = try PDFPageRenderer.writePagePNGs(
                from: request.sourceURL,
                to: pagesDirectory,
                maxDimension: 2_048,
                progress: progress
            )
            let outputURL = request.outputDirectory.appendingPathComponent("result.md")
            progress(0.22, "Loading Unlimited-OCR into unified memory")

            var arguments = [
                workerURL.path,
                "--model", LocalProviderPaths.unlimitedOCRModel.path,
                "--output", outputURL.path,
                "--title", request.fileName,
                "--images",
            ]
            arguments.append(contentsOf: pageURLs.map(\.path))

            let cacheRoot = LocalProviderPaths.unlimitedOCRRoot
                .appendingPathComponent("huggingface", isDirectory: true)
            _ = try LocalCommandRunner.run(
                executableURL: LocalProviderPaths.unlimitedOCRPython,
                arguments: arguments,
                environment: [
                    "HF_HOME": cacheRoot.path,
                    "HF_HUB_OFFLINE": "1",
                    "TRANSFORMERS_OFFLINE": "1",
                ]
            )

            guard FileManager.default.fileExists(atPath: outputURL.path) else {
                throw LocalProcessingError.missingOutput(self.descriptor.name)
            }
            progress(1, "Extraction complete")
            return LocalProcessingResult(outputURL: outputURL, pageCount: pageURLs.count)
        }.value
    }
}
