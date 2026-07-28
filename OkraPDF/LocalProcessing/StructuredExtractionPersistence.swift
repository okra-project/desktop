import Foundation

enum StructuredExtractionPersistence {
    static func pageURL(in pagesDirectory: URL, pageNumber: Int) -> URL {
        pagesDirectory.appendingPathComponent(
            String(format: "page-%04d.json", pageNumber)
        )
    }

    static func write(
        page: StructuredExtractionPage,
        to pagesDirectory: URL
    ) throws {
        try FileManager.default.createDirectory(
            at: pagesDirectory,
            withIntermediateDirectories: true
        )
        try encoder.encode(page).write(
            to: pageURL(in: pagesDirectory, pageNumber: page.pageNumber),
            options: .atomic
        )
    }

    static func loadPage(
        from pagesDirectory: URL,
        pageNumber: Int
    ) throws -> StructuredExtractionPage {
        try JSONDecoder().decode(
            StructuredExtractionPage.self,
            from: Data(contentsOf: pageURL(in: pagesDirectory, pageNumber: pageNumber))
        )
    }

    static func write(
        document: StructuredExtractionDocument,
        to url: URL
    ) throws {
        try encoder.encode(document).write(to: url, options: .atomic)
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return encoder
    }
}
