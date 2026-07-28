import Foundation

struct StructuredExtractionDocument: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let object: String
    let provider: StructuredExtractionProvider
    let title: String
    let pageCount: Int
    let completedPageCount: Int
    let complete: Bool
    let simulation: Bool
    let pages: [StructuredExtractionPage]

    static func load(from url: URL) throws -> StructuredExtractionDocument {
        try JSONDecoder().decode(
            StructuredExtractionDocument.self,
            from: Data(contentsOf: url)
        )
    }

    func write(to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: .atomic)
    }
}

struct StructuredExtractionProvider: Codable, Equatable, Sendable {
    let id: String
    let name: String
}

struct StructuredExtractionPage: Codable, Equatable, Identifiable, Sendable {
    var id: Int { pageNumber }

    let pageNumber: Int
    let imageFile: String
    let markdown: String
    let plainText: String
    let blocks: [StructuredExtractionBlock]
    let diagnostics: StructuredExtractionDiagnostics

    static func load(from url: URL) throws -> StructuredExtractionPage {
        try JSONDecoder().decode(
            StructuredExtractionPage.self,
            from: Data(contentsOf: url)
        )
    }

    func write(to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: .atomic)
    }
}

struct StructuredExtractionBlock: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let type: String
    let sourceType: String
    let text: String
    let bbox: StructuredExtractionBoundingBox?
    let sourceBbox: [Double]?
    let sourceBboxScale: Int?

    var displayText: String {
        guard type == "table" else { return text }
        return text
            .replacingOccurrences(of: "</td>", with: "  |  ", options: .caseInsensitive)
            .replacingOccurrences(of: "</th>", with: "  |  ", options: .caseInsensitive)
            .replacingOccurrences(of: "</tr>", with: "\n", options: .caseInsensitive)
            .replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct StructuredExtractionBoundingBox: Codable, Equatable, Sendable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let unit: String
    let origin: String

    var compactLabel: String {
        let xPercent = Int((x * 100).rounded())
        let yPercent = Int((y * 100).rounded())
        let widthPercent = Int((width * 100).rounded())
        let heightPercent = Int((height * 100).rounded())
        return "x \(xPercent)% · y \(yPercent)% · \(widthPercent)% × \(heightPercent)%"
    }
}

struct StructuredExtractionDiagnostics: Codable, Equatable, Sendable {
    let rawCharacterCount: Int
    let decodedCharacterCount: Int
    let tokenArtifactCount: Int
    let detectionCount: Int
    let malformedDetectionCount: Int
    let duplicateBlockCount: Int
    let loopDetected: Bool
    let warnings: [String]
}
