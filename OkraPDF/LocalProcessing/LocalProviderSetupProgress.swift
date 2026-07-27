import Foundation

struct LocalProviderSetupProgress: Equatable, Sendable {
    let phase: LocalProviderSetupPhase
    let fraction: Double?
    let message: String

    init(phase: LocalProviderSetupPhase, fraction: Double?, message: String) {
        self.phase = phase
        self.fraction = fraction.map { min(max($0, 0), 1) }
        self.message = message
    }
}
