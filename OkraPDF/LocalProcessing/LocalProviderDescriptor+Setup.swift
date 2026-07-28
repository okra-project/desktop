import Foundation

extension LocalProviderDescriptor {
    var downloadSizeBytes: Int64? {
        parserDefinition?.modelDelivery.pinnedPackage?.totalBytes
            ?? parserDefinition?.modelDelivery.apiVlmEndpoint?.approxDownloadBytes
    }

    var installLocation: String? {
        switch id {
        case .appleVision:
            nil
        case .unlimitedOCR:
            "~/.okra/providers/unlimited-ocr"
        case .chandra:
            "Ollama · okra-chandra:q4"
        }
    }
}
