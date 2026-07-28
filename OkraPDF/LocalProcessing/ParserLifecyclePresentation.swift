import Foundation

struct ParserLifecyclePresentation: Equatable, Sendable {
    let title: String
    let systemImage: String
    let accessibilityDescription: String
}

extension ParserLifecycleState {
    var presentation: ParserLifecyclePresentation {
        switch self {
        case .idle:
            return ParserLifecyclePresentation(
                title: "Not started",
                systemImage: "circle",
                accessibilityDescription: "has not started"
            )
        case .inProgress:
            return ParserLifecyclePresentation(
                title: "In progress",
                systemImage: "hourglass",
                accessibilityDescription: "is in progress"
            )
        case .done:
            return ParserLifecyclePresentation(
                title: "Done",
                systemImage: "checkmark.circle.fill",
                accessibilityDescription: "is done and saved"
            )
        case .attention:
            return ParserLifecyclePresentation(
                title: "Needs attention",
                systemImage: "exclamationmark.triangle.fill",
                accessibilityDescription: "needs attention before it can continue"
            )
        case .error:
            return ParserLifecyclePresentation(
                title: "Error",
                systemImage: "xmark.octagon.fill",
                accessibilityDescription: "failed with an error"
            )
        }
    }
}
