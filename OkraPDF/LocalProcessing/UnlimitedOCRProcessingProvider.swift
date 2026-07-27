import Foundation

struct UnlimitedOCRRuntime {
    let rootURL: URL
    let pythonURL: URL
    let modelURL: URL
    let readyMarkerURL: URL
    let cacheURL: URL
    let workerURL: URL?
    let isSimulation: Bool

    static func installed(workerURL: URL?) -> UnlimitedOCRRuntime {
        UnlimitedOCRRuntime(
            rootURL: LocalProviderPaths.unlimitedOCRRoot,
            pythonURL: LocalProviderPaths.unlimitedOCRPython,
            modelURL: LocalProviderPaths.unlimitedOCRModel,
            readyMarkerURL: LocalProviderPaths.unlimitedOCRReadyMarker,
            cacheURL: LocalProviderPaths.unlimitedOCRRoot
                .appendingPathComponent("huggingface", isDirectory: true),
            workerURL: workerURL,
            isSimulation: false
        )
    }

    static func simulated(workerURL: URL?) -> UnlimitedOCRRuntime {
        let pythonCandidates = [
            URL(fileURLWithPath: "/opt/homebrew/bin/python3"),
            URL(fileURLWithPath: "/usr/local/bin/python3"),
            URL(fileURLWithPath: "/usr/bin/python3"),
        ]
        let pythonURL = pythonCandidates.first {
            FileManager.default.isExecutableFile(atPath: $0.path)
        } ?? URL(fileURLWithPath: "/usr/bin/python3")
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("okra-unlimited-ocr-simulation", isDirectory: true)
        return UnlimitedOCRRuntime(
            rootURL: root,
            pythonURL: pythonURL,
            modelURL: root.appendingPathComponent("model", isDirectory: true),
            readyMarkerURL: root.appendingPathComponent(".ready"),
            cacheURL: root.appendingPathComponent("huggingface", isDirectory: true),
            workerURL: workerURL,
            isSimulation: true
        )
    }
}

final class UnlimitedOCRProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .unlimitedOCR,
        name: "Baidu Unlimited-OCR",
        summary: "Baidu's document parser, quantized to 4-bit MLX for Apple silicon.",
        setupNote: "One-time ~2.4 GB model download. Real extraction is forced offline after setup."
    )

    private let runtime: UnlimitedOCRRuntime

    init(
        runtime: UnlimitedOCRRuntime? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        let workerURL = Bundle.module.url(
            forResource: "unlimited-ocr-worker",
            withExtension: "py",
            subdirectory: "ProviderScripts"
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

    func install() async throws {
        guard !runtime.isSimulation else { return }
        guard let scriptURL = Bundle.module.url(
            forResource: "install-unlimited-ocr",
            withExtension: "sh",
            subdirectory: "ProviderScripts"
        ) else {
            throw LocalProcessingError.missingResource("Baidu Unlimited-OCR installer")
        }
        try await Task.detached(priority: .userInitiated) { [runtime] in
            _ = try LocalCommandRunner.run(
                executableURL: URL(fileURLWithPath: "/bin/zsh"),
                arguments: [scriptURL.path, runtime.rootURL.path]
            )
        }.value
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
