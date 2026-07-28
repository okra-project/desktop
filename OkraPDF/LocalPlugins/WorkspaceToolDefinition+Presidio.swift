import Foundation

extension WorkspaceToolID {
    static let presidioNER = WorkspaceToolID(rawValue: "presidio-ner")
}

extension WorkspaceToolDefinition {
    static let presidioNER = WorkspaceToolDefinition(
        id: .presidioNER,
        name: "Detect PII",
        category: .privacy,
        summary: "Find sensitive information with Presidio",
        executionLabel: "Offline after setup",
        registryLabel: "Plugin"
    )
}

extension WorkspaceToolRegistry {
    static let withPresidio: WorkspaceToolRegistry = {
        do {
            return try WorkspaceToolRegistry(tools: [.extract, .presidioNER])
        } catch {
            preconditionFailure("The Presidio workspace registry is invalid: \(error)")
        }
    }()
}
