import Foundation

enum LocalPageCheckpointStatus: String, Codable, Sendable {
    case pending
    case processing
    case succeeded
    case failed
}

struct LocalPageCheckpointManifest: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let totalPages: Int
    let createdAt: Date
    var updatedAt: Date
    var completedPageCount: Int
    var currentPageNumber: Int?
    var currentPageStatus: LocalPageCheckpointStatus?
    var lastCompletedPageNumber: Int?
    var lastCompletedAt: Date?
    var errorMessage: String?
}

enum LocalPageCheckpointError: LocalizedError, Equatable {
    case invalidTotalPages(Int)
    case invalidPageNumber(Int, totalPages: Int)
    case manifestPageCountMismatch(expected: Int, actual: Int)
    case missingPageResult(Int)

    var errorDescription: String? {
        switch self {
        case .invalidTotalPages(let count):
            return "Page checkpointing requires at least one page; received \(count)."
        case .invalidPageNumber(let pageNumber, let totalPages):
            return "Page \(pageNumber) is outside the document range 1...\(totalPages)."
        case .manifestPageCountMismatch(let expected, let actual):
            return "The page checkpoint expected \(expected) pages but found \(actual)."
        case .missingPageResult(let pageNumber):
            return "Page \(pageNumber) has not produced a Markdown checkpoint."
        }
    }
}

struct LocalPageCheckpointStore: Sendable {
    let outputDirectory: URL
    let totalPages: Int
    let documentHeader: String
    private let now: @Sendable () -> Date

    init(
        outputDirectory: URL,
        totalPages: Int,
        documentHeader: String,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.outputDirectory = outputDirectory
        self.totalPages = totalPages
        self.documentHeader = documentHeader
        self.now = now
    }

    var pagesDirectory: URL {
        outputDirectory.appendingPathComponent("page-results", isDirectory: true)
    }

    var manifestURL: URL {
        outputDirectory.appendingPathComponent("page-progress.json")
    }

    var resultURL: URL {
        outputDirectory.appendingPathComponent("result.md")
    }

    func pageURL(pageNumber: Int) -> URL {
        pagesDirectory.appendingPathComponent(
            String(format: "page-%04d.md", pageNumber)
        )
    }

    @discardableResult
    func prepare() throws -> LocalPageCheckpointManifest {
        guard totalPages > 0 else {
            throw LocalPageCheckpointError.invalidTotalPages(totalPages)
        }

        let fileManager = FileManager.default
        try fileManager.createDirectory(at: pagesDirectory, withIntermediateDirectories: true)

        if fileManager.fileExists(atPath: manifestURL.path) {
            let manifest = try loadManifest()
            guard manifest.totalPages == totalPages else {
                throw LocalPageCheckpointError.manifestPageCountMismatch(
                    expected: totalPages,
                    actual: manifest.totalPages
                )
            }
            return try reconcileCompletedPages()
        }

        let timestamp = now()
        let manifest = LocalPageCheckpointManifest(
            schemaVersion: 1,
            totalPages: totalPages,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedPageCount: 0,
            currentPageNumber: nil,
            currentPageStatus: nil,
            lastCompletedPageNumber: nil,
            lastCompletedAt: nil,
            errorMessage: nil
        )
        try persist(manifest)
        return manifest
    }

    func loadManifest() throws -> LocalPageCheckpointManifest {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            LocalPageCheckpointManifest.self,
            from: Data(contentsOf: manifestURL)
        )
    }

    func markProcessing(pageNumber: Int) throws {
        try validate(pageNumber: pageNumber)
        guard FileManager.default.fileExists(
            atPath: pageURL(pageNumber: pageNumber).path
        ) == false else {
            return
        }
        try updateManifest { manifest, _ in
            manifest.currentPageNumber = pageNumber
            manifest.currentPageStatus = .processing
            manifest.errorMessage = nil
        }
    }

    func writePage(pageNumber: Int, markdown: String) throws {
        try validate(pageNumber: pageNumber)
        try FileManager.default.createDirectory(
            at: pagesDirectory,
            withIntermediateDirectories: true
        )
        let destinationURL = pageURL(pageNumber: pageNumber)
        let alreadyExisted = FileManager.default.fileExists(atPath: destinationURL.path)
        let normalizedMarkdown = markdown.trimmingCharacters(in: .newlines) + "\n"
        try normalizedMarkdown.write(
            to: destinationURL,
            atomically: true,
            encoding: .utf8
        )

        try updateManifest { manifest, timestamp in
            if alreadyExisted == false {
                manifest.completedPageCount = min(
                    manifest.completedPageCount + 1,
                    manifest.totalPages
                )
            }
            manifest.currentPageNumber = pageNumber
            manifest.currentPageStatus = .succeeded
            manifest.lastCompletedPageNumber = pageNumber
            manifest.lastCompletedAt = timestamp
            manifest.errorMessage = nil
        }
    }

    func markFailed(pageNumber: Int, error: any Error) throws {
        try validate(pageNumber: pageNumber)
        guard FileManager.default.fileExists(
            atPath: pageURL(pageNumber: pageNumber).path
        ) == false else {
            return
        }
        try updateManifest { manifest, _ in
            manifest.currentPageNumber = pageNumber
            manifest.currentPageStatus = .failed
            manifest.errorMessage = error.localizedDescription
        }
    }

    func status(pageNumber: Int) throws -> LocalPageCheckpointStatus {
        try validate(pageNumber: pageNumber)
        if FileManager.default.fileExists(atPath: pageURL(pageNumber: pageNumber).path) {
            return .succeeded
        }
        let manifest = try loadManifest()
        if manifest.currentPageNumber == pageNumber {
            return manifest.currentPageStatus ?? .pending
        }
        return .pending
    }

    @discardableResult
    func reconcileCompletedPages() throws -> LocalPageCheckpointManifest {
        guard totalPages > 0 else {
            throw LocalPageCheckpointError.invalidTotalPages(totalPages)
        }
        var manifest = try loadManifest()
        let timestamp = now()
        let completedPageNumbers = (1...totalPages).filter { pageNumber in
            FileManager.default.fileExists(atPath: pageURL(pageNumber: pageNumber).path)
        }
        let lastCompletedPageNumber = completedPageNumbers.last
        let changed = manifest.completedPageCount != completedPageNumbers.count
            || manifest.lastCompletedPageNumber != lastCompletedPageNumber

        if changed {
            manifest.completedPageCount = completedPageNumbers.count
            manifest.lastCompletedPageNumber = lastCompletedPageNumber
            manifest.lastCompletedAt = lastCompletedPageNumber == nil ? nil : timestamp
            if manifest.currentPageNumber == lastCompletedPageNumber {
                manifest.currentPageStatus = .succeeded
                manifest.errorMessage = nil
            }
            manifest.updatedAt = timestamp
            try persist(manifest)
        }
        return manifest
    }

    func assembleResult() throws -> URL {
        try validateAllPageResults()
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        let temporaryURL = outputDirectory.appendingPathComponent(
            ".result-\(UUID().uuidString).md"
        )
        fileManager.createFile(atPath: temporaryURL.path, contents: nil)
        defer { try? fileManager.removeItem(at: temporaryURL) }

        do {
            let handle = try FileHandle(forWritingTo: temporaryURL)
            defer { try? handle.close() }
            let header = documentHeader.trimmingCharacters(in: .newlines) + "\n\n"
            try handle.write(contentsOf: Data(header.utf8))

            for pageNumber in 1...totalPages {
                let pageData = try Data(contentsOf: pageURL(pageNumber: pageNumber))
                try handle.write(contentsOf: pageData)
                if pageNumber < totalPages {
                    try handle.write(contentsOf: Data("\n".utf8))
                }
            }
            try handle.synchronize()
        } catch {
            try? fileManager.removeItem(at: temporaryURL)
            throw error
        }

        if fileManager.fileExists(atPath: resultURL.path) {
            _ = try fileManager.replaceItemAt(resultURL, withItemAt: temporaryURL)
        } else {
            try fileManager.moveItem(at: temporaryURL, to: resultURL)
        }
        return resultURL
    }

    private func updateManifest(
        update: (inout LocalPageCheckpointManifest, Date) -> Void
    ) throws {
        var manifest = try loadManifest()
        let timestamp = now()
        update(&manifest, timestamp)
        manifest.updatedAt = timestamp
        try persist(manifest)
    }

    private func validate(pageNumber: Int) throws {
        guard totalPages > 0 else {
            throw LocalPageCheckpointError.invalidTotalPages(totalPages)
        }
        guard (1...totalPages).contains(pageNumber) else {
            throw LocalPageCheckpointError.invalidPageNumber(
                pageNumber,
                totalPages: totalPages
            )
        }
    }

    private func validateAllPageResults() throws {
        guard totalPages > 0 else {
            throw LocalPageCheckpointError.invalidTotalPages(totalPages)
        }
        for pageNumber in 1...totalPages where FileManager.default.fileExists(
            atPath: pageURL(pageNumber: pageNumber).path
        ) == false {
            throw LocalPageCheckpointError.missingPageResult(pageNumber)
        }
    }

    private func persist(_ manifest: LocalPageCheckpointManifest) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(manifest).write(to: manifestURL, options: .atomic)
    }
}
