import Foundation

struct LocalPluginRegistry {
    private let runtimes: [any LocalPluginRuntime]

    init(runtimes: [any LocalPluginRuntime]) {
        precondition(
            Set(runtimes.map { $0.definition.id }).count == runtimes.count,
            "Local plugin identifiers must be unique."
        )
        self.runtimes = runtimes
    }

    static var standard: LocalPluginRegistry {
        LocalPluginRegistry(runtimes: [PresidioNERPlugin()])
    }

    var definitions: [LocalPluginDefinition] {
        runtimes.map(\.definition)
    }

    func runtime(for id: LocalPluginID) -> (any LocalPluginRuntime)? {
        runtimes.first { $0.definition.id == id }
    }
}
