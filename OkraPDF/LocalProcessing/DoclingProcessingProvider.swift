import Foundation

final class DoclingProcessingProvider: LocalProcessingProvider, @unchecked Sendable {
    let descriptor = LocalProviderDescriptor(
        id: .docling,
        name: "Docling",
        summary: "Layout-aware local parsing for headings, tables, reading order, and OCR.",
        setupNote: "One-time Python environment and model download. Extraction is forced offline afterward."
    )

    func availability() -> LocalProviderAvailability {
        runtime() == nil
            ? .setupRequired("Setup required")
            : .ready
    }

    func install() async throws {
        guard let scriptURL = Bundle.module.url(
            forResource: "install-docling",
            withExtension: "sh",
            subdirectory: "ProviderScripts"
        ) else {
            throw LocalProcessingError.missingResource("Docling installer")
        }
        let root = LocalProviderPaths.doclingRoot
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
        guard let runtime = runtime() else {
            throw LocalProcessingError.providerUnavailable("Set up Docling before extracting.")
        }

        return try await Task.detached(priority: .userInitiated) {
            try FileManager.default.createDirectory(
                at: request.outputDirectory,
                withIntermediateDirectories: true
            )
            let rawDirectory = request.outputDirectory.appendingPathComponent("docling", isDirectory: true)
            try FileManager.default.createDirectory(at: rawDirectory, withIntermediateDirectories: true)
            progress(0.05, "Docling is parsing the document")

            _ = try LocalCommandRunner.run(
                executableURL: runtime.executableURL,
                arguments: [
                    "convert", request.sourceURL.path,
                    "--to", "md",
                    "--output", rawDirectory.path,
                    "--artifacts-path", runtime.modelsURL.path,
                    "--image-export-mode", "placeholder",
                    "--device", "mps",
                    "--no-enable-remote-services",
                    "--abort-on-error",
                ],
                environment: [
                    "HF_HUB_OFFLINE": "1",
                    "TRANSFORMERS_OFFLINE": "1",
                ]
            )

            guard let markdownURL = Self.firstMarkdownFile(in: rawDirectory) else {
                throw LocalProcessingError.missingOutput(self.descriptor.name)
            }
            let outputURL = request.outputDirectory.appendingPathComponent("result.md")
            if FileManager.default.fileExists(atPath: outputURL.path) {
                try FileManager.default.removeItem(at: outputURL)
            }
            try FileManager.default.copyItem(at: markdownURL, to: outputURL)
            progress(1, "Extraction complete")
            return LocalProcessingResult(
                outputURL: outputURL,
                pageCount: max(request.expectedPageCount, 0)
            )
        }.value
    }

    private func runtime() -> (executableURL: URL, modelsURL: URL)? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultModels = home.appendingPathComponent(".cache/docling/models", isDirectory: true)
        let fm = FileManager.default

        if fm.fileExists(atPath: LocalProviderPaths.doclingReadyMarker.path),
           fm.isExecutableFile(atPath: LocalProviderPaths.doclingExecutable.path),
           fm.fileExists(atPath: LocalProviderPaths.doclingModels.path) {
            return (LocalProviderPaths.doclingExecutable, LocalProviderPaths.doclingModels)
        }

        let systemCandidates = [
            home.appendingPathComponent(".local/bin/docling"),
            URL(fileURLWithPath: "/opt/homebrew/bin/docling"),
            URL(fileURLWithPath: "/usr/local/bin/docling"),
        ]
        return systemCandidates.first {
            FileManager.default.isExecutableFile(atPath: $0.path)
                && FileManager.default.fileExists(atPath: defaultModels.path)
        }.map { (executableURL: $0, modelsURL: defaultModels) }
    }

    private static func firstMarkdownFile(in directory: URL) -> URL? {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return nil }

        for case let url as URL in enumerator where url.pathExtension.lowercased() == "md" {
            return url
        }
        return nil
    }
}
