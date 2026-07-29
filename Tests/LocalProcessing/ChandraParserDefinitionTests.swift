import Foundation
import Testing
@testable import Okra

struct ChandraParserDefinitionTests {
    @Test("Chandra is an OpenAI-compatible API VLM with the Chandra HTML adapter")
    func runtimeAndAdapter() {
        #expect(LocalParserCatalog.chandra.runtime == .apiVLM)
        #expect(LocalParserCatalog.chandra.outputAdapter == .chandraHTMLV1)
    }

    @Test("Chandra targets the Ollama OpenAI-compatible endpoint with a baked context window")
    func endpoint() throws {
        let endpoint = try #require(LocalParserCatalog.chandra.modelDelivery.apiVlmEndpoint)
        #expect(endpoint.baseURL == "http://localhost:11434/v1")
        #expect(endpoint.model == "okra-chandra:q4")
        #expect(endpoint.runtimeType == .ollama)
        #expect(endpoint.responseFormat == "html-databbox")
        #expect(endpoint.ollamaBaseModel == "ahmgam/chandra-ocr-2:q4")
        #expect(endpoint.numCtx == 8_192)
    }

    @Test("Chandra ships no pinned weights — the runtime owns the model")
    func noBundledWeights() {
        #expect(LocalParserCatalog.chandra.modelDelivery.pinnedPackage == nil)
    }

    @Test("Chandra setup size comes from its endpoint download estimate")
    func downloadSize() {
        let descriptor = ChandraProcessingProvider().descriptor
        #expect(descriptor.downloadSizeBytes == 3_400_000_000)
    }

    @Test("Chandra fits the baseline 8 GB Apple-silicon Mac")
    func baselineCompatibility() {
        let host = LocalParserHostProfile(
            architecture: .appleSilicon,
            macOSMajorVersion: 13,
            unifiedMemoryGB: 8,
            availableDiskBytes: 5_000_000_000
        )
        #expect(LocalParserCatalog.chandra.requirements.compatibility(with: host) == .supported)
    }

    @Test("API-VLM delivery round-trips for run provenance")
    func codableRoundTrip() throws {
        let data = try JSONEncoder().encode(LocalParserCatalog.chandra)
        let decoded = try JSONDecoder().decode(LocalParserDefinition.self, from: data)
        #expect(decoded == LocalParserCatalog.chandra)
    }

    @Test("Chandra page JSON decodes through the shared page-scoped contract")
    func pageOutputDecodes() throws {
        let data = try #require(
            """
            {
              "pageNumber": 1,
              "imageFile": "page-0001.png",
              "markdown": "Parsed by Chandra",
              "plainText": "Parsed by Chandra",
              "blocks": [],
              "diagnostics": {
                "rawCharacterCount": 42,
                "blockCount": 1,
                "duplicateBlockCount": 0,
                "loopDetected": false,
                "warnings": []
              }
            }
            """.data(using: .utf8)
        )

        let page = try JSONDecoder().decode(StructuredExtractionPage.self, from: data)

        #expect(page.markdown == "Parsed by Chandra")
        #expect(page.diagnostics.rawCharacterCount == 42)
        #expect(page.diagnostics.decodedCharacterCount == 0)
        #expect(page.diagnostics.blockCount == 1)
        #expect(page.provenance == nil)
    }
}
