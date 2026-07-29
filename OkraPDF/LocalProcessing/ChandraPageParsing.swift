import Foundation

struct ChandraPageParsingRequest: Sendable {
    let pageNumber: Int
    let imageURL: URL
}

struct ChandraPageParsingResult: Sendable {
    let markdown: String
    let structuredPage: StructuredExtractionPage
}

protocol ChandraPageParsing: AnyObject, Sendable {
    func availability() -> LocalProviderAvailability
    func install(
        progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void
    ) async throws
    func prepareForParsing() async throws
    func parsePage(
        request: ChandraPageParsingRequest,
        progress: @escaping LocalProcessingProgress
    ) async throws -> ChandraPageParsingResult
}
