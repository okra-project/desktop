import Foundation

enum LocalPluginID: String, CaseIterable, Codable, Hashable, Sendable {
    case presidioNER = "presidio-ner"
}

enum LocalPluginCategory: String, Codable, Sendable {
    case privacy
}

struct LocalPluginOperationDefinition: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let summary: String
}

struct LocalPluginPermissions: Equatable, Sendable {
    let setupRequiresNetwork: Bool
    let runtimeAllowsNetwork: Bool
    let readsExtractedText: Bool
    let writesInsideRunDirectory: Bool
}

struct LocalPluginDefinition: Identifiable, Equatable, Sendable {
    let id: LocalPluginID
    let name: String
    let publisher: String
    let version: String
    let category: LocalPluginCategory
    let summary: String
    let setupNote: String
    let homepage: URL
    let license: String
    let permissions: LocalPluginPermissions
    let operations: [LocalPluginOperationDefinition]
}

enum LocalPluginAvailability: Equatable, Sendable {
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

struct LocalPluginSetupProgress: Equatable, Sendable {
    let fraction: Double?
    let message: String

    init(fraction: Double?, message: String) {
        self.fraction = fraction.map { min(max($0, 0), 1) }
        self.message = message
    }
}

struct LocalPluginInvocation: Sendable {
    let runID: String
    let sourceOutputURL: URL
    let structuredOutputURL: URL?
    let outputDirectory: URL
}

typealias LocalPluginProgress = @Sendable (_ fraction: Double?, _ message: String) -> Void

protocol LocalPluginRuntime: AnyObject {
    var definition: LocalPluginDefinition { get }
    func availability() -> LocalPluginAvailability
    func install(progress: @escaping @Sendable (LocalPluginSetupProgress) -> Void) async throws
    func invoke(
        invocation: LocalPluginInvocation,
        progress: @escaping LocalPluginProgress
    ) async throws -> URL
}

enum LocalPluginError: LocalizedError {
    case missingResource(String)
    case pluginUnavailable(String)
    case invalidSourceOutput(String)
    case invalidResult(String)

    var errorDescription: String? {
        switch self {
        case .missingResource(let name):
            return "The app is missing its bundled \(name) resource."
        case .pluginUnavailable(let reason):
            return reason
        case .invalidSourceOutput(let reason):
            return reason
        case .invalidResult(let reason):
            return reason
        }
    }
}
