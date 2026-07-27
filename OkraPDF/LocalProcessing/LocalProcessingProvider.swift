import Foundation

enum LocalProviderID: String, CaseIterable, Codable, Hashable {
    case appleVision = "apple-vision"
    case docling
    case unlimitedOCR = "unlimited-ocr"
}

struct LocalProviderDescriptor: Identifiable, Equatable {
    let id: LocalProviderID
    let name: String
    let summary: String
    let setupNote: String?
}

enum LocalProviderAvailability: Equatable {
    case ready
    case simulated(String)
    case setupRequired(String)
    case unavailable(String)

    var isReady: Bool {
        switch self {
        case .ready, .simulated:
            return true
        case .setupRequired, .unavailable:
            return false
        }
    }

    var isSimulated: Bool {
        if case .simulated = self { return true }
        return false
    }

    var message: String {
        switch self {
        case .ready:
            return "Ready offline"
        case .simulated(let message), .setupRequired(let message), .unavailable(let message):
            return message
        }
    }
}

struct LocalProcessingRequest {
    let fileName: String
    let sourceURL: URL
    let outputDirectory: URL
    let expectedPageCount: Int
}

struct LocalProcessingResult {
    let outputURL: URL
    let pageCount: Int
}

struct LocalProcessingRun: Identifiable, Codable, Equatable {
    let id: String
    let sourcePath: String
    let fileName: String
    let providerId: String
    let providerName: String
    let executionMode: String?
    var status: String
    var outputPath: String?
    var errorMessage: String?
    var pageCount: Int
    let startedAt: Date
    var completedAt: Date?
}

typealias LocalProcessingProgress = @Sendable (_ fraction: Double, _ message: String) -> Void

protocol LocalProcessingProvider: AnyObject {
    var descriptor: LocalProviderDescriptor { get }
    func availability() -> LocalProviderAvailability
    func install() async throws
    func process(
        request: LocalProcessingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> LocalProcessingResult
}

extension LocalProcessingProvider {
    func install() async throws {
        throw LocalProcessingError.installNotSupported(descriptor.name)
    }
}

enum LocalProcessingError: LocalizedError {
    case installNotSupported(String)
    case missingResource(String)
    case invalidPDF
    case noPages
    case providerUnavailable(String)
    case commandFailed(command: String, status: Int32, output: String)
    case missingOutput(String)

    var errorDescription: String? {
        switch self {
        case .installNotSupported(let provider):
            return "Automatic setup is not available for \(provider)."
        case .missingResource(let name):
            return "The app is missing its bundled \(name) resource."
        case .invalidPDF:
            return "The PDF could not be opened."
        case .noPages:
            return "The PDF does not contain any pages."
        case .providerUnavailable(let reason):
            return reason
        case .commandFailed(let command, let status, let output):
            let detail = output.trimmingCharacters(in: .whitespacesAndNewlines)
            let clippedDetail = detail.count > 2_000 ? String(detail.suffix(2_000)) : detail
            return clippedDetail.isEmpty
                ? "\(command) exited with status \(status)."
                : "\(command) failed: \(clippedDetail)"
        case .missingOutput(let provider):
            return "\(provider) finished without producing Markdown."
        }
    }
}
