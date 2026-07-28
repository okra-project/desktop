import AppKit

enum OkraBrand {
    static let canonicalMarkSHA256 =
        "155f9c81bc50ab916658c12f8f1500ff2a08fcccb641339c79e8846733740152"

    static var markURL: URL? {
        BundledResourceLocator.url(
            forResource: "AppIcon",
            withExtension: "png"
        )
    }

    static var markImage: NSImage? {
        guard let markURL else { return nil }
        return NSImage(contentsOf: markURL)
    }
}
