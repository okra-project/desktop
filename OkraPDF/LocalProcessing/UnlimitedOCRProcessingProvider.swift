import Foundation

final class UnlimitedOCRProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .unlimitedOCR,
        name: "Baidu Unlimited-OCR",
        summary: "Baidu's document parser, quantized to 4-bit MLX for Apple silicon.",
        setupNote: "One-time ~2.4 GB model download. Real extraction is forced offline after setup."
    )

    private let runtime: UnlimitedOCRRuntime
    private let installer: any UnlimitedOCRModelInstalling

    init(
        runtime: UnlimitedOCRRuntime? = nil,
        installer: any UnlimitedOCRModelInstalling = UnlimitedOCRModelInstaller(),
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        self.installer = installer
        let workerURL = ProviderResources.scriptURL(
            named: "unlimited-ocr-worker",
            extension: "py"
        )
        if let runtime {
            self.runtime = runtime
        } else if environment["OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR"] == "1" {
            self.runtime = .simulated(workerURL: workerURL)
        } else {
            self.runtime = .installed(workerURL: workerURL)
        }
    }

    func availability() -> LocalProviderAvailability {
        let fm = FileManager.default
        guard let workerURL = runtime.workerURL,
              fm.fileExists(atPath: workerURL.path) else {
            return .unavailable("Bundled worker missing")
        }

        if runtime.isSimulation {
            return fm.isExecutableFile(atPath: runtime.pythonURL.path)
                ? .simulated("Simulation ready")
                : .unavailable("Python 3 is required for simulation")
        }

        let isReady = fm.fileExists(atPath: runtime.readyMarkerURL.path)
            && fm.isExecutableFile(atPath: runtime.pythonURL.path)
            && fm.fileExists(atPath: runtime.modelURL.path)
        return isReady ? .ready : .setupRequired("Setup required · ~2.4 GB")
    }

    func install(progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void) async throws {
        guard !runtime.isSimulation else { return }
        guard let scriptURL = ProviderResources.scriptURL(
            named: "install-unlimited-ocr",
            extension: "sh"
        ) else {
            throw LocalProcessingError.missingResource("Baidu Unlimited-OCR installer")
        }
        try await installer.install(runtime: runtime, scriptURL: scriptURL, progress: progress)
    }

    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult {
        guard availability().isReady else {
            throw LocalProcessingError.providerUnavailable("Set up Baidu Unlimited-OCR before extracting.")
        }
        guard let workerURL = runtime.workerURL else {
            throw LocalProcessingError.missingResource("Baidu Unlimited-OCR worker")
        }

        return try await Task.detached(priority: .userInitiated) { [runtime] in
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
            progress(
                0.22,
                runtime.isSimulation
                    ? "Simulating the Baidu Unlimited-OCR worker"
                    : "Loading Baidu Unlimited-OCR into unified memory"
            )

            var arguments = [
                workerURL.path,
                "--model", runtime.modelURL.path,
                "--output", outputURL.path,
                "--title", request.fileName,
                "--images",
            ]
            arguments.append(contentsOf: pageURLs.map(\.path))
            if runtime.isSimulation {
                arguments.append("--simulate")
            }

            _ = try LocalCommandRunner.run(
                executableURL: runtime.pythonURL,
                arguments: arguments,
                environment: [
                    "HF_HOME": runtime.cacheURL.path,
                    "HF_HUB_OFFLINE": "1",
                    "TRANSFORMERS_OFFLINE": "1",
                    "HF_DATASETS_OFFLINE": "1",
                ]
            )

            guard FileManager.default.fileExists(atPath: outputURL.path) else {
                throw LocalProcessingError.missingOutput(self.descriptor.name)
            }
            progress(1, runtime.isSimulation ? "Simulation complete" : "Extraction complete")
            return LocalProcessingResult(outputURL: outputURL, pageCount: pageURLs.count)
        }.value
    }
}
