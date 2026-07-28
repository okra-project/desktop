import Foundation

enum LocalPluginPaths {
    static var pluginsRoot: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".okra", isDirectory: true)
            .appendingPathComponent("plugins", isDirectory: true)
    }

    static var presidioRoot: URL {
        pluginsRoot.appendingPathComponent(LocalPluginID.presidioNER.rawValue, isDirectory: true)
    }

    static var presidioPython: URL {
        presidioRoot
            .appendingPathComponent("venv", isDirectory: true)
            .appendingPathComponent("bin", isDirectory: true)
            .appendingPathComponent("python")
    }

    static var presidioReadyMarker: URL {
        presidioRoot.appendingPathComponent(".ready")
    }

    static func pluginOutputDirectory(for runDirectory: URL, pluginID: LocalPluginID) -> URL {
        runDirectory
            .appendingPathComponent("plugins", isDirectory: true)
            .appendingPathComponent(pluginID.rawValue, isDirectory: true)
    }
}
