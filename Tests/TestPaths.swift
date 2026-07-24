import Foundation

enum TestPaths {
    static var temporaryDirectory: URL {
        if let path = ProcessInfo.processInfo.environment["OKRA_DESKTOP_TEST_TMPDIR"] {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return FileManager.default.temporaryDirectory
    }
}
