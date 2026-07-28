import Foundation

extension LocalProviderDescriptor {
    var downloadSizeBytes: Int64? {
        switch id {
        case .unlimitedOCR:
            UnlimitedOCRModelManifest.totalBytes
        case .appleVision:
            nil
        }
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
