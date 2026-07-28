import Foundation

enum WorkspaceToolRegistryError: Error, Equatable {
    case empty
    case duplicate(WorkspaceToolID)
}

struct WorkspaceToolRegistry: Sendable {
    let tools: [WorkspaceToolDefinition]

    init(tools: [WorkspaceToolDefinition]) throws {
        guard tools.isEmpty == false else {
            throw WorkspaceToolRegistryError.empty
        }

        var identifiers = Set<WorkspaceToolID>()
        for tool in tools where identifiers.insert(tool.id).inserted == false {
            throw WorkspaceToolRegistryError.duplicate(tool.id)
        }

        self.tools = tools
    }

    var categories: [WorkspaceToolCategory] {
        WorkspaceToolCategory.allCases.filter { category in
            tools.contains(where: { $0.category == category })
        }
    }

    func tools(in category: WorkspaceToolCategory) -> [WorkspaceToolDefinition] {
        tools.filter { $0.category == category }
    }

    func tool(withID id: WorkspaceToolID) -> WorkspaceToolDefinition? {
        tools.first(where: { $0.id == id })
    }

    func resolvedSelection(_ requestedID: WorkspaceToolID?) -> WorkspaceToolID {
        if let requestedID, tool(withID: requestedID) != nil {
            return requestedID
        }
        return tools[0].id
    }
}

extension WorkspaceToolRegistry {
    static let standard: WorkspaceToolRegistry = {
        do {
            return try WorkspaceToolRegistry(tools: [.extract])
        } catch {
            preconditionFailure("The built-in workspace tool registry is invalid: \(error)")
        }
    }()
}
