import Foundation

/// Minimal client for a local Ollama runtime that serves document-VLM parsers
/// over its OpenAI-compatible endpoint. Mirrors june's "bring your own local
/// endpoint" probe (list models via the OpenAI `/models` route) and adds the
/// Ollama-specific provisioning (`pull` + `create`) that Docling's `API_OLLAMA`
/// preset assumes has already happened.
///
/// The app never bundles or downloads weights itself — Ollama owns the model
/// store under `~/.ollama/models` (or `$OLLAMA_MODELS`).
enum OllamaClient {
    /// Common install locations for the `ollama` binary (Homebrew + Ollama.app).
    static let executableCandidates: [URL] = [
        URL(fileURLWithPath: "/opt/homebrew/bin/ollama"),
        URL(fileURLWithPath: "/usr/local/bin/ollama"),
        URL(fileURLWithPath: "/opt/homebrew/opt/ollama/bin/ollama"),
        URL(fileURLWithPath: "/Applications/Ollama.app/Contents/Resources/ollama"),
    ]

    static func executableURL() -> URL? {
        executableCandidates.first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }

    static var isInstalled: Bool { executableURL() != nil }

    /// Ollama's model store (`$OLLAMA_MODELS`, else `~/.ollama/models`).
    static var modelsRoot: URL {
        if let override = ProcessInfo.processInfo.environment["OLLAMA_MODELS"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".ollama", isDirectory: true)
            .appendingPathComponent("models", isDirectory: true)
    }

    /// Synchronous presence check via the on-disk manifest — safe to call from
    /// `availability()` (no network). `ref` is `name:tag`, e.g. `okra-chandra:q4`.
    static func hasLocalModel(_ ref: String) -> Bool {
        let split = ref.split(separator: ":", maxSplits: 1).map(String.init)
        let name = split.first ?? ref
        let tag = split.count > 1 ? split[1] : "latest"
        let manifests = modelsRoot.appendingPathComponent("manifests/registry.ollama.ai", isDirectory: true)
        let candidates = [
            manifests.appendingPathComponent("library/\(name)/\(tag)"),
            manifests.appendingPathComponent("\(name)/\(tag)"),
        ]
        return candidates.contains { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// GET `{baseURL}/models` — reachability + available model ids (june's
    /// `LocalEndpointProbe`). Returns nil when the endpoint is unreachable.
    static func listModels(baseURL: String, apiKey: String = "") async -> [String]? {
        let trimmed = baseURL.trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmed)/models") else { return nil }
        var request = URLRequest(url: url, timeoutInterval: 5)
        let key = apiKey.trimmingCharacters(in: .whitespaces)
        if !key.isEmpty { request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            return try JSONDecoder().decode(ModelsResponse.self, from: data).data.map(\.id)
        } catch {
            return nil
        }
    }

    /// `ollama pull <model>` — downloads the base model into Ollama's store.
    static func pull(_ model: String) async throws {
        try await runCLI(["pull", model])
    }

    /// `ollama create <name> -f <modelfile>` — layers config (num_ctx, …) over an
    /// already-pulled base blob; no re-download.
    static func create(name: String, modelfileURL: URL) async throws {
        try await runCLI(["create", name, "-f", modelfileURL.path])
    }

    private static func runCLI(_ arguments: [String]) async throws {
        guard let executable = executableURL() else {
            throw LocalProcessingError.providerUnavailable(
                "Ollama is not installed. Install it from https://ollama.com, then set up Chandra."
            )
        }
        _ = try await LocalCommandRunner.runAsync(executableURL: executable, arguments: arguments)
    }

    private struct ModelsResponse: Decodable { let data: [ModelEntry] }
    private struct ModelEntry: Decodable { let id: String }
}
