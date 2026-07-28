import Foundation

extension LocalProviderDescriptor {
    var downloadSizeBytes: Int64? {
        parserDefinition?.modelDelivery.pinnedPackage?.totalBytes
    }

    var installLocation: String? {
        switch id {
        case .appleVision:
            nil
        case .unlimitedOCR:
            "~/.okra/providers/unlimited-ocr"
        }
    }
}
