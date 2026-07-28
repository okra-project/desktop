import Testing
@testable import Okra

struct WorkspaceToolRegistryTests {
    @Test("Built-in registry exposes Extract as the initial local tool")
    func standardRegistryStartsWithExtract() {
        let registry = WorkspaceToolRegistry.standard

        #expect(registry.tools == [.extract])
        #expect(registry.categories == [.understand])
        #expect(registry.resolvedSelection(nil) == .extract)
        #expect(registry.tool(withID: .extract)?.executionLabel == "Runs on this Mac")
    }

    @Test("Registry preserves category and tool ordering for future plugins")
    func registryPreservesOrdering() throws {
        let detectPII = WorkspaceToolDefinition(
            id: WorkspaceToolID(rawValue: "detect-pii"),
            name: "Detect PII",
            category: .privacy,
            summary: "Find sensitive information",
            executionLabel: "Runs on this Mac",
            registryLabel: "Plugin"
        )
        let registry = try WorkspaceToolRegistry(tools: [.extract, detectPII])

        #expect(registry.categories == [.understand, .privacy])
        #expect(registry.tools(in: .understand).map(\.id) == [.extract])
        #expect(registry.tools(in: .privacy).map(\.id) == [detectPII.id])
        #expect(registry.resolvedSelection(detectPII.id) == detectPII.id)
    }

    @Test("Registry rejects empty and duplicate definitions")
    func registryValidation() {
        #expect(throws: WorkspaceToolRegistryError.empty) {
            try WorkspaceToolRegistry(tools: [])
        }
        #expect(throws: WorkspaceToolRegistryError.duplicate(.extract)) {
            try WorkspaceToolRegistry(tools: [.extract, .extract])
        }
    }

    @Test("Unknown selections fall back to the first registered tool")
    func unknownSelectionFallsBack() {
        let registry = WorkspaceToolRegistry.standard

        #expect(
            registry.resolvedSelection(WorkspaceToolID(rawValue: "removed-tool"))
                == .extract
        )
    }
}
