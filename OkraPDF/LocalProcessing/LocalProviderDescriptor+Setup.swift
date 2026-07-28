import Foundation

extension LocalProviderDescriptor {
    var downloadSizeBytes: Int64? {
        switch id {
        case .unlimitedOCR:
            UnlimitedOCRModelManifest.totalBytes
        case .appleVision, .docling:
            nil
        }
    }

    var installLocation: String? {
        switch id {
        case .appleVision:
            nil
        case .docling:
            "~/.okra/providers/docling"
        case .unlimitedOCR:
            "~/.okra/providers/unlimited-ocr"
        }
    }
}
