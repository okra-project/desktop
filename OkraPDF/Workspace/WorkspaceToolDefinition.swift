import Foundation

struct WorkspaceToolID: RawRepresentable, Hashable, Codable, Sendable, Identifiable {
    let rawValue: String

    var id: String { rawValue }

    init(rawValue: String) {
        precondition(rawValue.isEmpty == false, "Workspace tool identifiers cannot be empty")
        self.rawValue = rawValue
    }
}

extension WorkspaceToolID {
    static let extract = WorkspaceToolID(rawValue: "extract")
}

enum WorkspaceToolCategory: String, CaseIterable, Codable, Sendable, Identifiable {
    case understand = "Understand"
    case privacy = "Privacy"
    case edit = "Edit"
    case export = "Export"

    var id: String { rawValue }
}

struct WorkspaceToolDefinition: Identifiable, Equatable, Sendable {
    let id: WorkspaceToolID
    let name: String
    let category: WorkspaceToolCategory
    let summary: String
    let executionLabel: String
    let registryLabel: String
}

extension WorkspaceToolDefinition {
    static let extract = WorkspaceToolDefinition(
        id: .extract,
        name: "Extract",
        category: .understand,
        summary: "OCR, layout, and Markdown",
        executionLabel: "Runs on this Mac",
        registryLabel: "Built in"
    )
}
