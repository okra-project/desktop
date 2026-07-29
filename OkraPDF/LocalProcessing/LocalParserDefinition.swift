import Foundation

enum LocalParserRuntimeID: String, Codable, CaseIterable, Sendable {
    case appleVision = "apple-vision"
    case mlxVLM = "mlx-vlm"
}

enum LocalParserOutputAdapterID: String, Codable, CaseIterable, Sendable {
    case plainTextV1 = "plain-text-v1"
    case unlimitedOCRTokensV1 = "unlimited-ocr-tokens-v1"
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

enum LocalParserModelDelivery: Codable, Equatable, Sendable {
    case system
    case runtimeManaged
    case pinned(LocalModelPackageManifest)

    var pinnedPackage: LocalModelPackageManifest? {
        guard case .pinned(let package) = self else { return nil }
        return package
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
}
