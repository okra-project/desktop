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

    static func runAsync(
        executableURL: URL,
        arguments: [String],
        environment additions: [String: String] = [:]
    ) async throws -> String {
        let processBox = LocalCommandProcessBox()

        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                let logURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("okra-provider-\(UUID().uuidString).log")

                do {
                    FileManager.default.createFile(atPath: logURL.path, contents: nil)
                    let logHandle = try FileHandle(forWritingTo: logURL)
                    let process = Process()
                    process.executableURL = executableURL
                    process.arguments = arguments
                    process.standardOutput = logHandle
                    process.standardError = logHandle
                    process.environment = ProcessInfo.processInfo.environment.merging(additions) { _, new in new }
                    process.terminationHandler = { process in
                        try? logHandle.synchronize()
                        try? logHandle.close()
                        let output = (try? String(contentsOf: logURL, encoding: .utf8)) ?? ""
                        try? FileManager.default.removeItem(at: logURL)

                        if processBox.wasCancelled {
                            continuation.resume(throwing: CancellationError())
                        } else if process.terminationStatus == 0 {
                            continuation.resume(returning: output)
                        } else {
                            continuation.resume(
                                throwing: LocalProcessingError.commandFailed(
                                    command: executableURL.lastPathComponent,
                                    status: process.terminationStatus,
                                    output: output
                                )
                            )
                        }
                    }

                    try process.run()
                    processBox.register(process)
                } catch {
                    try? FileManager.default.removeItem(at: logURL)
                    continuation.resume(throwing: error)
                }
            }
        } onCancel: {
            processBox.cancel()
        }
    }
}
