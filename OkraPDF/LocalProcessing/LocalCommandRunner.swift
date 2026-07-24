import Foundation

enum LocalCommandRunner {
    static func run(
        executableURL: URL,
        arguments: [String],
        environment additions: [String: String] = [:]
    ) throws -> String {
        let logURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("okra-provider-\(UUID().uuidString).log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        defer { try? FileManager.default.removeItem(at: logURL) }

        let logHandle = try FileHandle(forWritingTo: logURL)
        defer { try? logHandle.close() }

        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments
        process.standardOutput = logHandle
        process.standardError = logHandle
        process.environment = ProcessInfo.processInfo.environment.merging(additions) { _, new in new }

        try process.run()
        process.waitUntilExit()
        try logHandle.synchronize()

        let output = (try? String(contentsOf: logURL, encoding: .utf8)) ?? ""
        guard process.terminationStatus == 0 else {
            throw LocalProcessingError.commandFailed(
                command: executableURL.lastPathComponent,
                status: process.terminationStatus,
                output: output
            )
        }
        return output
    }
}
