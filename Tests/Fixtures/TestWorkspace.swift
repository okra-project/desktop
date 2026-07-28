import Foundation

enum TestWorkspaceError: Error {
    case userDefaultsUnavailable(String)
}

final class TestWorkspace {
    let root: URL
    let defaultsName: String
    let defaults: UserDefaults

    init(prefix: String) throws {
        root = TestPaths.temporaryDirectory
            .appendingPathComponent("\(prefix)-\(UUID().uuidString)", isDirectory: true)
        defaultsName = "\(prefix)-defaults-\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: defaultsName) else {
            throw TestWorkspaceError.userDefaultsUnavailable(defaultsName)
        }
        self.defaults = defaults
    }

    deinit {
        try? FileManager.default.removeItem(at: root)
        defaults.removePersistentDomain(forName: defaultsName)
    }

    var runsRoot: URL {
        root.appendingPathComponent("runs", isDirectory: true)
    }
}
