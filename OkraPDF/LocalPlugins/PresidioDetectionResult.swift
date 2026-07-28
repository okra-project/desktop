import Foundation

struct PIIBoundingBox: Codable, Equatable, Sendable {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

struct PresidioDetectionNode: Codable, Equatable, Sendable {
    let id: String
    let page: Int?
    let text: String
    let bbox: PIIBoundingBox?
}

struct PresidioDetectionRequest: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let sourceOutput: String
    let language: String
    let entities: [String]
    let minScore: Double
    let nodes: [PresidioDetectionNode]

    static func build(
        sourceOutputURL: URL,
        structuredOutputURL: URL?,
        entities: [String],
        minScore: Double
    ) throws -> PresidioDetectionRequest {
        let nodes: [PresidioDetectionNode]

        if let structuredOutputURL,
           let document = try? StructuredExtractionDocument.load(from: structuredOutputURL) {
            nodes = document.pages.flatMap { page in
                page.blocks.compactMap { block in
                    let text = block.displayText.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard text.isEmpty == false else { return nil }
                    return PresidioDetectionNode(
                        id: "page-\(page.pageNumber)-\(block.id)",
                        page: page.pageNumber,
                        text: text,
                        bbox: block.bbox.flatMap(Self.normalizedBoundingBox)
                    )
                }
            }
        } else {
            let markdown = try String(contentsOf: sourceOutputURL, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard markdown.isEmpty == false else {
                throw LocalPluginError.invalidSourceOutput(
                    "The extraction did not contain text for Presidio to analyze."
                )
            }
            nodes = markdownNodes(markdown)
        }

        guard nodes.isEmpty == false else {
            throw LocalPluginError.invalidSourceOutput(
                "The structured extraction did not contain text blocks for Presidio to analyze."
            )
        }

        return PresidioDetectionRequest(
            schemaVersion: 1,
            sourceOutput: sourceOutputURL.path,
            language: "en",
            entities: entities,
            minScore: min(max(minScore, 0), 1),
            nodes: nodes
        )
    }

    private static func normalizedBoundingBox(
        _ bbox: StructuredExtractionBoundingBox
    ) -> PIIBoundingBox? {
        guard bbox.unit == "normalized", bbox.origin == "top-left" else { return nil }
        return PIIBoundingBox(
            x: bbox.x,
            y: bbox.y,
            w: bbox.width,
            h: bbox.height
        )
    }

    private static func markdownNodes(_ markdown: String) -> [PresidioDetectionNode] {
        let maximumCharacters = 100_000
        var nodes: [PresidioDetectionNode] = []
        var start = markdown.startIndex
        var chunkNumber = 1

        while start < markdown.endIndex {
            let end = markdown.index(
                start,
                offsetBy: maximumCharacters,
                limitedBy: markdown.endIndex
            ) ?? markdown.endIndex
            nodes.append(
                PresidioDetectionNode(
                    id: "markdown-output-\(chunkNumber)",
                    page: nil,
                    text: String(markdown[start..<end]),
                    bbox: nil
                )
            )
            start = end
            chunkNumber += 1
        }
        return nodes
    }
}

struct PresidioDetectionResult: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let object: String
    let plugin: String
    let sourceOutput: String
    let findings: [PresidioFinding]
    let boxes: [PresidioRedactionBox]
    let stats: PresidioDetectionStats

    static func load(from url: URL) throws -> PresidioDetectionResult {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let result = try decoder.decode(
            PresidioDetectionResult.self,
            from: Data(contentsOf: url)
        )
        guard result.object == "okra.pii-detection", result.plugin == LocalPluginID.presidioNER.rawValue else {
            throw LocalPluginError.invalidResult("Presidio returned an unexpected result contract.")
        }
        return result
    }
}

struct PresidioRedactionBox: Codable, Equatable, Identifiable, Sendable {
    let page: Int
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let type: String
    let text: String
    let score: Double
    let source: String

    var id: String {
        "\(page):\(x):\(y):\(w):\(h):\(type):\(text)"
    }
}

struct PresidioFinding: Codable, Equatable, Identifiable, Sendable {
    let nodeId: String
    let page: Int?
    let entityType: String
    let start: Int
    let end: Int
    let score: Double
    let text: String
    let bbox: PIIBoundingBox?

    var id: String {
        "\(nodeId):\(start):\(end):\(entityType)"
    }
}

struct PresidioDetectionStats: Codable, Equatable, Sendable {
    let total: Int
    let byType: [String: Int]
    let bySource: [String: Int]
    let nodesAnalyzed: Int
    let boxesAvailable: Int
}
