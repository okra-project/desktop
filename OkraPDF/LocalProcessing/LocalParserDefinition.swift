import Foundation

enum LocalParserRuntimeID: String, Codable, CaseIterable, Sendable {
    case appleVision = "apple-vision"
    case mlxVLM = "mlx-vlm"
    /// A VLM served over an OpenAI-compatible /v1/chat/completions endpoint
    /// (Ollama, LM Studio, vLLM, LiteLLM). Shape mirrors Docling's ApiVlmOptions.
    case apiVLM = "api-vlm"
}

enum LocalParserOutputAdapterID: String, Codable, CaseIterable, Sendable {
    case plainTextV1 = "plain-text-v1"
    case unlimitedOCRTokensV1 = "unlimited-ocr-tokens-v1"
    /// Chandra layout HTML (`<div data-bbox data-label>` with inline tables/math).
    case chandraHTMLV1 = "chandra-html-v1"
}

enum LocalParserCapability: String, Codable, CaseIterable, Sendable {
    case nativeText
    case ocr
    case readingOrder
    case layoutBlocks
    case boundingBoxes
    case tables
    case formulas
    case charts
    case code
    case multilingual
    case structuredOutput
}

enum LocalParserArchitecture: String, Codable, CaseIterable, Sendable {
    case appleSilicon = "apple-silicon"
    case intel
}

enum LocalModelFormat: String, Codable, CaseIterable, Sendable {
    case mlxSafetensors = "mlx-safetensors"
}

struct LocalModelQuantization: Codable, Equatable, Sendable {
    let bits: Int
    let scheme: String
}

struct LocalModelArtifact: Codable, Equatable, Sendable {
    let path: String
    let size: Int64
    let sha256: String
}

struct LocalModelPackageManifest: Codable, Equatable, Sendable {
    let displayName: String
    let upstreamRepository: String
    let repository: String
    let revision: String
    let format: LocalModelFormat
    let quantization: LocalModelQuantization?
    let parameterCount: Int64?
    let licenseSPDXIdentifier: String
    let artifacts: [LocalModelArtifact]

    var totalBytes: Int64 {
        artifacts.reduce(Int64(0)) { partialResult, artifact in
            partialResult + artifact.size
        }
    }

    func downloadURL(for artifact: LocalModelArtifact) -> URL? {
        var components = URLComponents(string: "https://huggingface.co")
        components?.path = "/\(repository)/resolve/\(revision)/\(artifact.path)"
        components?.queryItems = [URLQueryItem(name: "download", value: "true")]
        return components?.url
    }
}

/// Per-backend preset, mirroring Docling's `runtime_type` (API_OLLAMA, API_LMSTUDIO, ...).
enum ApiVlmRuntimeType: String, Codable, CaseIterable, Sendable {
    case ollama
    case lmStudio = "lmstudio"
    case openAI = "openai"
    case generic
}

/// A document-VLM served over an OpenAI-compatible endpoint. Doc-parsing-shaped
/// (mirrors Docling's `ApiVlmOptions`): the served model, the page-image render
/// scale, and the response format are first-class. For the Ollama runtime this
/// also carries the provisioning recipe (pull `ollamaBaseModel`, then
/// `ollama create model` from a Modelfile that bakes `numCtx`, since /v1 ignores
/// a per-request num_ctx and the page image would otherwise overflow the window).
struct ApiVlmEndpoint: Codable, Equatable, Sendable {
    /// OpenAI-compatible base URL, e.g. `http://localhost:11434/v1`.
    let baseURL: String
    /// Served model id, e.g. `okra-chandra:q4`.
    let model: String
    let runtimeType: ApiVlmRuntimeType
    /// The worker's output adapter key, e.g. `html-databbox`.
    let responseFormat: String
    let timeoutSeconds: Int
    /// Render scale (DPI-ish) for page images sent to the endpoint.
    let renderScale: Double
    // --- Ollama provisioning (runtimeType == .ollama) ---
    let ollamaBaseModel: String?
    let numCtx: Int?
    let approxDownloadBytes: Int64?
}

enum LocalParserModelDelivery: Codable, Equatable, Sendable {
    case system
    case runtimeManaged
    case pinned(LocalModelPackageManifest)
    /// Model served by an OpenAI-compatible endpoint (Ollama & friends). No
    /// weights are downloaded or bundled by the app; the runtime owns them.
    case apiVlm(ApiVlmEndpoint)

    var pinnedPackage: LocalModelPackageManifest? {
        guard case .pinned(let package) = self else { return nil }
        return package
    }

    var apiVlmEndpoint: ApiVlmEndpoint? {
        guard case .apiVlm(let endpoint) = self else { return nil }
        return endpoint
    }
}

struct LocalParserResourceRequirements: Codable, Equatable, Sendable {
    let supportedArchitectures: Set<LocalParserArchitecture>
    let minimumMacOSMajorVersion: Int
    let minimumUnifiedMemoryGB: Int?
    let recommendedUnifiedMemoryGB: Int?
    let minimumFreeDiskBytes: Int64?

    func compatibility(with host: LocalParserHostProfile) -> LocalParserCompatibility {
        var incompatibilities: [LocalParserIncompatibility] = []

        if supportedArchitectures.contains(host.architecture) == false {
            incompatibilities.append(.architecture(host.architecture))
        }
        if host.macOSMajorVersion < minimumMacOSMajorVersion {
            incompatibilities.append(.macOS(minimumMajorVersion: minimumMacOSMajorVersion))
        }
        if let minimumUnifiedMemoryGB,
           host.unifiedMemoryGB < minimumUnifiedMemoryGB {
            incompatibilities.append(.unifiedMemory(minimumGB: minimumUnifiedMemoryGB))
        }
        if let minimumFreeDiskBytes,
           let availableDiskBytes = host.availableDiskBytes,
           availableDiskBytes < minimumFreeDiskBytes {
            incompatibilities.append(
                .freeDisk(requiredBytes: minimumFreeDiskBytes, availableBytes: availableDiskBytes)
            )
        }

        return incompatibilities.isEmpty ? .supported : .unsupported(incompatibilities)
    }
}

struct LocalParserHostProfile: Codable, Equatable, Sendable {
    let architecture: LocalParserArchitecture
    let macOSMajorVersion: Int
    let unifiedMemoryGB: Int
    let availableDiskBytes: Int64?
}

enum LocalParserIncompatibility: Codable, Equatable, Sendable {
    case architecture(LocalParserArchitecture)
    case macOS(minimumMajorVersion: Int)
    case unifiedMemory(minimumGB: Int)
    case freeDisk(requiredBytes: Int64, availableBytes: Int64)
}

enum LocalParserCompatibility: Codable, Equatable, Sendable {
    case supported
    case unsupported([LocalParserIncompatibility])
}

struct LocalParserDefinition: Codable, Equatable, Sendable {
    let runtime: LocalParserRuntimeID
    let modelDelivery: LocalParserModelDelivery
    let outputAdapter: LocalParserOutputAdapterID
    let capabilities: Set<LocalParserCapability>
    let requirements: LocalParserResourceRequirements
}

enum LocalParserCatalog {
    static let appleVision = LocalParserDefinition(
        runtime: .appleVision,
        modelDelivery: .system,
        outputAdapter: .plainTextV1,
        capabilities: [.nativeText, .ocr, .multilingual],
        requirements: LocalParserResourceRequirements(
            supportedArchitectures: [.appleSilicon, .intel],
            minimumMacOSMajorVersion: 13,
            minimumUnifiedMemoryGB: nil,
            recommendedUnifiedMemoryGB: nil,
            minimumFreeDiskBytes: nil
        )
    )

    static let unlimitedOCR = LocalParserDefinition(
        runtime: .mlxVLM,
        modelDelivery: .pinned(UnlimitedOCRModelManifest.package),
        outputAdapter: .unlimitedOCRTokensV1,
        capabilities: [
            .ocr,
            .readingOrder,
            .layoutBlocks,
            .boundingBoxes,
            .tables,
            .formulas,
            .charts,
            .multilingual,
            .structuredOutput,
        ],
        requirements: LocalParserResourceRequirements(
            supportedArchitectures: [.appleSilicon],
            minimumMacOSMajorVersion: 13,
            minimumUnifiedMemoryGB: 16,
            recommendedUnifiedMemoryGB: 16,
            minimumFreeDiskBytes: 3_000_000_000
        )
    )

    /// Chandra OCR 2 (Datalab, 5B VLM) served over Ollama's OpenAI-compatible
    /// endpoint via the `okra-chandra:q4` Modelfile variant. Weights are managed
    /// by Ollama, never bundled. License: modified OpenRAIL-M (use-restrictions +
    /// share-alike) — surface at setup; not permissive.
    static let chandra = LocalParserDefinition(
        runtime: .apiVLM,
        modelDelivery: .apiVlm(ApiVlmEndpoint(
            baseURL: "http://localhost:11434/v1",
            model: "okra-chandra:q4",
            runtimeType: .ollama,
            responseFormat: "html-databbox",
            timeoutSeconds: 1_800,
            renderScale: 2.0,
            ollamaBaseModel: "ahmgam/chandra-ocr-2:q4",
            numCtx: 8_192,
            approxDownloadBytes: 3_400_000_000
        )),
        outputAdapter: .chandraHTMLV1,
        capabilities: [
            .ocr,
            .readingOrder,
            .layoutBlocks,
            .boundingBoxes,
            .tables,
            .formulas,
            .code,
            .multilingual,
            .structuredOutput,
        ],
        requirements: LocalParserResourceRequirements(
            supportedArchitectures: [.appleSilicon],
            minimumMacOSMajorVersion: 13,
            minimumUnifiedMemoryGB: 8,
            recommendedUnifiedMemoryGB: 16,
            minimumFreeDiskBytes: 5_000_000_000
        )
    )
}
