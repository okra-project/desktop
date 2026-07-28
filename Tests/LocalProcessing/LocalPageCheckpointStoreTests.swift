import Foundation
import Testing
@testable import Okra

struct LocalPageCheckpointStoreTests {
    @Test("A completed page is durable before the document finishes")
    func completedPageIsDurableBeforeDocumentFinishes() throws {
        let workspace = try TestWorkspace(prefix: "okra-page-checkpoint")
        let completedAt = Date(timeIntervalSince1970: 1_000)
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 3,
            documentHeader: "# sample.pdf",
            now: { completedAt }
        )

        try store.prepare()
        try store.markProcessing(pageNumber: 1)
        try store.writePage(pageNumber: 1, markdown: "## Page 1\n\nFirst page")

        let pageURL = store.pageURL(pageNumber: 1)
        let manifest = try store.loadManifest()
        #expect(try String(contentsOf: pageURL, encoding: .utf8) == "## Page 1\n\nFirst page\n")
        #expect(FileManager.default.fileExists(atPath: store.resultURL.path) == false)
        #expect(manifest.completedPageCount == 1)
        #expect(try store.status(pageNumber: 1) == .succeeded)
        #expect(manifest.lastCompletedAt == completedAt)
        #expect(try store.status(pageNumber: 2) == .pending)
    }

    @Test("Final Markdown is assembled from page files in numeric order")
    func finalMarkdownUsesNumericPageOrder() throws {
        let workspace = try TestWorkspace(prefix: "okra-page-assembly")
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 3,
            documentHeader: "# sample.pdf"
        )

        try store.prepare()
        try store.writePage(pageNumber: 3, markdown: "## Page 3\n\nThird")
        try store.writePage(pageNumber: 1, markdown: "## Page 1\n\nFirst")
        try store.writePage(pageNumber: 2, markdown: "## Page 2\n\nSecond")
        let resultURL = try store.assembleResult()
        let markdown = try String(contentsOf: resultURL, encoding: .utf8)

        let firstRange = try #require(markdown.range(of: "## Page 1"))
        let secondRange = try #require(markdown.range(of: "## Page 2"))
        let thirdRange = try #require(markdown.range(of: "## Page 3"))
        #expect(firstRange.lowerBound < secondRange.lowerBound)
        #expect(secondRange.lowerBound < thirdRange.lowerBound)
        #expect(markdown.hasPrefix("# sample.pdf\n\n"))
    }

    @Test("Worker page files can rebuild checkpoint progress after interruption")
    func workerFilesRebuildCheckpointProgress() throws {
        let workspace = try TestWorkspace(prefix: "okra-page-reconcile")
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 2,
            documentHeader: "# sample.pdf"
        )

        try store.prepare()
        try FileManager.default.createDirectory(
            at: store.pagesDirectory,
            withIntermediateDirectories: true
        )
        try "## Page 1\n\nRecovered\n".write(
            to: store.pageURL(pageNumber: 1),
            atomically: true,
            encoding: .utf8
        )

        let manifest = try store.reconcileCompletedPages()
        #expect(manifest.completedPageCount == 1)
        #expect(try store.status(pageNumber: 1) == .succeeded)
        #expect(try store.status(pageNumber: 2) == .pending)
    }

    @Test("A failed page preserves earlier successful checkpoints")
    func failedPagePreservesEarlierCheckpoints() throws {
        let workspace = try TestWorkspace(prefix: "okra-page-failure")
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 3,
            documentHeader: "# sample.pdf"
        )

        try store.prepare()
        try store.writePage(pageNumber: 1, markdown: "## Page 1\n\nFirst")
        try store.markProcessing(pageNumber: 2)
        try store.markFailed(
            pageNumber: 2,
            error: LocalProcessingError.invalidPDF
        )

        let manifest = try store.loadManifest()
        #expect(manifest.completedPageCount == 1)
        #expect(try store.status(pageNumber: 1) == .succeeded)
        #expect(try store.status(pageNumber: 2) == .failed)
        #expect(manifest.errorMessage == LocalProcessingError.invalidPDF.localizedDescription)
        #expect(FileManager.default.fileExists(atPath: store.pageURL(pageNumber: 1).path))
    }

    @Test("Out-of-range page numbers are rejected", arguments: [0, 4])
    func outOfRangePageNumbersAreRejected(pageNumber: Int) throws {
        let workspace = try TestWorkspace(prefix: "okra-invalid-page-checkpoint")
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 3,
            documentHeader: "# sample.pdf"
        )
        try store.prepare()

        #expect(
            throws: LocalPageCheckpointError.invalidPageNumber(
                pageNumber,
                totalPages: 3
            )
        ) {
            try store.markProcessing(pageNumber: pageNumber)
        }
    }

    @Test("Empty documents cannot create page checkpoints")
    func emptyDocumentsAreRejected() throws {
        let workspace = try TestWorkspace(prefix: "okra-empty-page-checkpoint")
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: 0,
            documentHeader: "# empty.pdf"
        )

        #expect(throws: LocalPageCheckpointError.invalidTotalPages(0)) {
            try store.prepare()
        }
    }

    @Test(
        "Large documents retain one independently readable file per page",
        .tags(.largeDocument),
        .timeLimit(.minutes(1))
    )
    func largeDocumentRetainsIndependentPageFiles() throws {
        let workspace = try TestWorkspace(prefix: "okra-large-page-checkpoints")
        let pageCount = 120
        let store = LocalPageCheckpointStore(
            outputDirectory: workspace.root,
            totalPages: pageCount,
            documentHeader: "# large.pdf"
        )

        try store.prepare()
        for pageNumber in 1...pageCount {
            try store.writePage(
                pageNumber: pageNumber,
                markdown: "## Page \(pageNumber)\n\nContent \(pageNumber)"
            )
        }

        let manifest = try store.loadManifest()
        let manifestBytes = try Data(contentsOf: store.manifestURL).count
        let pageFiles = try FileManager.default.contentsOfDirectory(
            at: store.pagesDirectory,
            includingPropertiesForKeys: nil
        )
        #expect(manifest.completedPageCount == pageCount)
        #expect(manifestBytes < 2_000, "Progress metadata should stay constant-size as page count grows.")
        #expect(pageFiles.filter { $0.pathExtension == "md" }.count == pageCount)
        #expect(
            try String(contentsOf: store.pageURL(pageNumber: 87), encoding: .utf8)
                == "## Page 87\n\nContent 87\n"
        )
    }
}
