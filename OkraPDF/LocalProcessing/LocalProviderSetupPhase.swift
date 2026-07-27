import Foundation

enum LocalProviderSetupPhase: String, Codable, Equatable, Sendable {
    case preparing
    case installingRuntime
    case downloadingModel
    case verifying
    case ready
}
