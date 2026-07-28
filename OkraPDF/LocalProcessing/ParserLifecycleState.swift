import Foundation

enum ParserLifecycleState: String, CaseIterable, Codable, Hashable, Sendable {
    case idle
    case inProgress
    case done
    case attention
    case error

    func canTransition(to nextState: ParserLifecycleState) -> Bool {
        if self == nextState {
            return true
        }
        if nextState == .idle {
            return false
        }
        return self != .done
    }

    static func rollup(_ states: [ParserLifecycleState]) -> ParserLifecycleState {
        if states.contains(.attention) {
            return .attention
        }
        if states.contains(.error) {
            return .error
        }
        if states.contains(.inProgress) {
            return .inProgress
        }
        if states.isEmpty == false, states.allSatisfy({ $0 == .done }) {
            return .done
        }
        return .idle
    }
}
