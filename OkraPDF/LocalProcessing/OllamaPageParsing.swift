import Foundation

struct OllamaPageParsingRequest: Sendable {
    let pageNumber: Int
    let imageURL: URL
}

struct OllamaPageParsingResult: Sendable {
    let markdown: String
    let structuredPage: StructuredExtractionPage
}

protocol OllamaPageParsing: AnyObject, Sendable {
    func availability() -> LocalProviderAvailability
    func prepareForParsing() async throws
    func parsePage(
        request: OllamaPageParsingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> OllamaPageParsingResult
}
